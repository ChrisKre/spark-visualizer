# Simulator specification

`packages/sim` is the heart of the project. This document is **normative**: the implementation
follows it, and when reality disagrees, this file is updated first.

## 0. Contract

```ts
simulate(config: RunConfig, seed: number): RunResult
```

Pure. Deterministic. No I/O, no `Date.now()`, no `Math.random()`. Same `(config, seed)` always
produces byte-identical output. This is asserted by golden tests.

## 1. Types

```ts
type SimMs = number & { readonly __brand: 'SimMs' };
type Bytes = number & { readonly __brand: 'Bytes' };

interface RunConfig {
  cluster: {
    executors: number;          // default 8
    coresPerExecutor: number;   // default 4  → slots = executors * cores
    executorMemoryMiB: number;  // default 8192
    memoryFraction: number;     // spark.memory.fraction, default 0.6
    storageFraction: number;    // spark.memory.storageFraction, default 0.5
  };
  sql: {
    shufflePartitions: number;          // spark.sql.shuffle.partitions, default 200
    autoBroadcastJoinThresholdMiB: number; // default 10
    adaptive: {
      enabled: boolean;                 // default true (Spark 3.2+)
      advisoryPartitionSizeMiB: number; // default 64
      coalescePartitions: boolean;      // default true
      skewJoinEnabled: boolean;         // default true
      skewedPartitionFactor: number;    // default 5
      skewedPartitionThresholdMiB: number; // default 256
    };
  };
  data: {
    rows: number;
    keyCardinality: number;
    zipfAlpha: number;          // 0 = uniform; 1.6 ≈ top key owns ~50 %
    nullFraction: number;       // nulls all hash to one partition
    bytesPerRow: number;
    saltFactor: number;         // 1 = no salting
  };
  query: QuerySpec;             // which plan to build (aggregate | join | window)
}

interface RunResult {
  provenance: 'measured' | 'modeled';
  fixtureId?: string;
  stages: StageResult[];
  tasks: TaskResult[];
  plan: { initial: PlanNode; final: PlanNode; rewrites: AqeRewrite[] };
  metrics: RunMetrics;          // the metric ribbon reads this
  warnings: Warning[];          // e.g. OOM, excessive GC, idle reducers
}

interface TaskResult {
  taskId: number; stageId: number; slot: number;
  partitionId: number;
  launchMs: SimMs; finishMs: SimMs;
  inputBytes: Bytes;
  shuffleReadBytes: Bytes; shuffleWriteBytes: Bytes;
  fetchWaitMs: SimMs; gcMs: SimMs;
  memorySpilledBytes: Bytes; diskSpilledBytes: Bytes;
  peakExecutionMemoryBytes: Bytes;
  status: 'ok' | 'spilled' | 'oom';
}
```

## 2. Pipeline

```
config ──▶ 1. partition sizing ──▶ 2. plan build ──▶ 3. AQE rewrite
       ──▶ 4. task generation   ──▶ 5. scheduling  ──▶ 6. metric rollup
```

### Step 1 — partition sizing

Key frequencies follow a Zipf distribution over `keyCardinality` keys with exponent `zipfAlpha`,
via inverse transform sampling on a seeded PRNG (`mulberry32`). Nulls are handled **first**:
`nullFraction` of rows are assigned a single synthetic null key, which is what Spark does —
`HashPartitioner` sends every null to the same reducer.

```
p(k) = k^(-alpha) / H(N, alpha)     for k = 1..N
```

Keys map to partitions by `nonNegativeMod(hash(key), shufflePartitions)`, using a seeded
32-bit murmur so collisions are realistic rather than perfectly spread. With
`saltFactor > 1`, key `k` becomes `k || '_' || (rowIndex % saltFactor)` before hashing — the
same transform the PySpark example in the module spec performs.

**Invariant:** total bytes across partitions is conserved under salting. Salting redistributes;
it never reduces. A golden test asserts this.

### Step 2 — plan build

`QuerySpec` maps to a small physical plan tree: `Scan → Exchange → Sort → SortMergeJoin → …`.
Join strategy is chosen exactly as Spark does at planning time:

1. If either side has a broadcast hint, or its **estimated** size ≤ `autoBroadcastJoinThresholdMiB`,
   choose `BroadcastHashJoin`.
2. Else if one side is small enough to build a hash table per partition and
   `spark.sql.join.preferSortMergeJoin` is false, choose `ShuffledHashJoin`.
3. Else `SortMergeJoin`.

Estimated size at planning time is deliberately allowed to be **wrong** — that is the whole
point of AQE, and M3/M2 depend on the discrepancy being visible.

### Step 3 — AQE rewrite

Runs only if `adaptive.enabled`. Each rule is a pure `(plan, runtimeStats) => plan` function in
`packages/sim/plan/aqe.ts`, and each emits an `AqeRewrite` record that the plan-tree animation
consumes.

| Rule | Trigger | Effect |
|---|---|---|
| `coalesceShufflePartitions` | mean post-shuffle partition size < `advisoryPartitionSizeMiB` | merge adjacent partitions until each is ≈ advisory size; emits new partition count |
| `dynamicJoinSelection` | materialised side size ≤ `autoBroadcastJoinThresholdMiB` | replace `SortMergeJoin` with `BroadcastHashJoin`; drop one `Exchange` and both `Sort` nodes |
| `optimizeSkewedJoin` | partition size > `skewedPartitionThresholdMiB` **and** > `skewedPartitionFactor` × median | split that partition into `ceil(size / advisory)` sub-partitions; replicate the matching side |

The order is fixed: skew split, then coalesce, then join selection. Document any deviation.

### Step 4 — task generation

One task per partition per stage. Task cost is additive:

```
taskMs = deserializeMs
       + readMs        = inputBytes / readThroughput
       + computeMs     = rows * cpuNsPerRow / 1e6
       + sortMs        = rows * log2(rows) * sortNsPerRowLog / 1e6      (if a Sort node)
       + shuffleWriteMs= shuffleWriteBytes / shuffleWriteThroughput
       + fetchWaitMs   (see step 5)
       + spillPenaltyMs(see below)
       + gcMs          (see below)
```

All throughput constants live in `packages/sim/calibration/constants.generated.ts` and are
**fitted from fixtures**, never hand-tuned in a PR. See [FIXTURES.md](./FIXTURES.md).

**Spill.** Execution memory available to one task:

```
usableMiB   = executorMemoryMiB - 300                 // reserved
unifiedMiB  = usableMiB * memoryFraction
storageFloor= unifiedMiB * storageFraction
executionCeilingPerTask = (unifiedMiB - liveStorageMiB) / coresPerExecutor
```

Execution may evict cached storage blocks down to `storageFloor`; storage may **never** evict
execution. This asymmetry is the lesson of M4 and must be modelled explicitly, not approximated.

If `peakExecutionMemory > executionCeilingPerTask`, the task spills:

```
spillBytes    = peak - ceiling
diskSpillBytes= spillBytes * serializationRatio      // ~0.35, fitted
spillPenaltyMs= (spillBytes / spillWriteThroughput) + (spillBytes / spillReadThroughput)
                + spillMergePasses * mergeCostMs
```

Past `oomThresholdRatio` (fitted, ~1.8× ceiling after spill) the task is marked `oom`, the stage
fails, and the UI shows the failure rather than a plausible-looking number. **A simulated job is
allowed to fail.** That is a feature.

**GC.** `gcMs = heapPressure^2 * gcBaseMs`, where `heapPressure = usedHeap / usableHeap`,
clamped at 1.4. Quadratic because that is what the fixture data shows; the exponent is fitted.

### Step 5 — scheduling

A slot-based discrete event simulation. `slots = executors * coresPerExecutor`. Tasks are queued
in partition order and assigned to the next free slot (Spark's FIFO within a stage; locality
preferences are out of scope for v1.0 and tracked as a v2 ticket).

Stage wall clock is `max(finishMs) - min(launchMs)` — **not** the sum of task times. Making that
distinction visible is the primary teaching goal of the whole project, so the simulator must
never shortcut it.

`fetchWaitMs` is modelled per reducer: a reducer cannot start until its map outputs exist, and
concurrent fetches share `networkBandwidthMBps` across active slots.

### Step 6 — metric rollup

```ts
interface RunMetrics {
  wallClockMs: SimMs;
  cpuSeconds: number;
  stragglerRatio: number;   // max(taskMs) / median(taskMs)
  shuffleReadBytes: Bytes; shuffleWriteBytes: Bytes;
  diskSpilledBytes: Bytes; memorySpilledBytes: Bytes;
  gcMs: SimMs; gcPercent: number;
  idleReducers: number;     // partitions with zero rows
  estimatedCostUsd?: number; // v3
}
```

## 3. Fixture snapping

Before simulating, `resolveRun(config)` checks the fixture index for a run whose config is within
ε of the requested one. If found, it returns the fixture with `provenance: 'measured'`. ε is
declared per knob in the module spec — for example M1 snaps when `|zipfAlpha − fixture.alpha| ≤ 0.05`
and every other knob matches exactly.

**The badge in the UI is driven by this and nothing else.** Never fake a `measured` badge.

## 4. Calibration

`tools/capture/calibrate.py` fits the constants by least squares against measured stage
durations and writes `constants.generated.ts` with a provenance header:

```ts
// GENERATED by tools/capture/calibrate.py — do not edit by hand.
// Fitted against 34 runs, DBR 14.3 LTS, 8 × i3.xlarge, Spark 3.5.0.
// Residual: mean absolute error 7.8 % on stage wall clock (n=34, R² 0.94).
export const SHUFFLE_WRITE_THROUGHPUT_MBPS = 118.4;
```

The residual is published in the UI. If a code change moves the residual, the PR must say so.

## 5. Testing requirements

| Test class | What it asserts |
|---|---|
| Golden | `simulate(config, seed)` output hash matches a committed snapshot, for 12 canonical configs |
| Invariant | bytes conserved under salting; wall clock ≥ max task duration; coalescing never increases partition count |
| Monotonicity | increasing `zipfAlpha` never decreases `stragglerRatio`; increasing `executorMemoryMiB` never increases `diskSpilledBytes` |
| Calibration | modelled vs measured MAE ≤ 12 % across all committed fixtures — **this is a CI gate** |
| Determinism | 100 runs of the same input produce one distinct output hash |

## 6. Explicitly out of scope for v1.0

Speculative execution, dynamic allocation, task retries and failures other than OOM, data
locality levels, external shuffle service, Photon, RDD-level APIs, multi-query concurrency.
Each of these has a v2/v3 ticket if it ever earns one.
