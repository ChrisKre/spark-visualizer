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

// The plan tree. A rewrite (§3) replaces a subtree wholesale and produces new node ids —
// ids are stable only within one snapshot (`plan.initial`, `plan.final`, or one side of an
// `AqeRewrite`), never across a rewrite.
type PlanNodeKind =
  | 'Scan'
  | 'Exchange'          // a shuffle boundary — see GLOSSARY.md
  | 'BroadcastExchange' // collects a side to the driver for a broadcast join; not a shuffle boundary
  | 'Sort'
  | 'Aggregate'
  | 'Project'
  | 'BroadcastHashJoin'
  | 'ShuffledHashJoin'
  | 'SortMergeJoin';

interface PlanNode {
  id: number;
  kind: PlanNodeKind;
  children: PlanNode[];
  stageId: number;               // Scan's stage is 0; increments at each Exchange/BroadcastExchange
  estimatedSizeBytes?: Bytes;     // planner-time guess — deliberately allowed to be wrong (Step 2)
  actualSizeBytes?: Bytes;        // filled in once the producing stage has materialised
  partitionCount?: number;        // shuffle partitions this node emits (Exchange only)
}

// Intentionally minimal and left open for extension: v1.0 needs exactly the M1 (skew + join)
// and M2 (AQE) shapes. `window` is reserved for M3/v1.1 and unused before then.
type QuerySpec =
  | { kind: 'aggregate' }
  | {
      kind: 'join';
      joinType: 'inner' | 'left';
      // Describes the dimension ("other") side of the join. `RunConfig.data` describes the
      // large/fact side.
      other: { rows: number; bytesPerRow: number };
      broadcastHint?: boolean;
      // Planner size-estimate error multiplier for `other`'s materialised size — this is a
      // module knob (M2's `est`, see docs/modules/m2-aqe.md §3), not a real Spark config.
      // 1 = the planner's estimate is accurate.
      estimateErrorFactor?: number;
    }
  | { kind: 'window'; partitionByKeyCardinality: number }; // reserved; unused before v1.1

interface StageResult {
  stageId: number;
  planNodeId: number;      // the Exchange/BroadcastExchange this stage's output feeds
  taskIds: number[];
  launchMs: SimMs;         // min(launch) across this stage's tasks
  finishMs: SimMs;         // max(finish) — never the sum (Step 5)
  status: 'ok' | 'failed'; // 'failed' iff any task in the stage is 'oom'
  partitionBytes: Bytes[]; // per-partition output size, in partition order
}

type WarningCode = 'oom' | 'excessive-gc' | 'idle-reducers' | 'high-spill';

interface Warning {
  code: WarningCode;
  stageId?: number;
  message: string;
}

interface AqeRewrite {
  rule: 'optimizeSkewedJoin' | 'coalesceShufflePartitions' | 'dynamicJoinSelection';
  atMs: SimMs;              // = the producing stage's finishMs, never t=0
  producingStageId: number;
  description: string;      // e.g. "coalesced 200 → 17 partitions" — consumed verbatim by PlanTree
  before: PlanNode;         // outgoing subtree, for the rewrite animation
  after: PlanNode;          // incoming subtree
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

**Implementation note — sampling cap.** `data.rows` can be in the tens of millions; drawing one
inverse-transform sample per row does not fit a 16 ms recompute budget (module knobs recompute on
every drag) or a fast CI run. Draw `min(rows, ZIPF_SAMPLE_CAP)` samples instead (`ZIPF_SAMPLE_CAP`
is a plain code constant in `packages/sim/skew/partition.ts` — a performance choice, not a fitted
calibration constant), tabulate the empirical per-key histogram, then scale every key's count by
`rows / sampleSize` before converting to bytes. Same seed still produces the same sample and thus
identical scaled output — determinism holds. This is why a large-`rows` config's exact key
distribution is a scaled empirical sample, not a literal closed-form Zipf pmf, and why "top key
holds 45–55 % of rows" is stated as a range rather than one exact number.

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
| `optimizeSkewedJoin` | partition size > `skewedPartitionThresholdMiB` **and** > `skewedPartitionFactor` × median | split that partition into `ceil(size / advisory)` sub-partitions; replicate the matching side |
| `coalesceShufflePartitions` | mean post-shuffle partition size < `advisoryPartitionSizeMiB` | merge adjacent partitions until each is ≈ advisory size; emits new partition count |
| `dynamicJoinSelection` | materialised side size ≤ `autoBroadcastJoinThresholdMiB` | replace `SortMergeJoin` with `BroadcastHashJoin`; drop one `Exchange` and both `Sort` nodes |

The order above is fixed — skew split, then coalesce, then join selection — and is
`applyAqeRewrites`'s literal call order in `packages/sim/plan/aqe.ts`. Document any deviation.

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

**Implementation note — `fetchWaitMs` is not part of the static per-partition formula above.**
It depends on *when* upstream map outputs became available and how many reducers are fetching
concurrently right now — that is scheduling state, unknowable to a pure per-partition cost
function. `packages/sim/model/cost.ts` computes every other term (`baseMs`); the scheduler
(Step 5, `packages/sim/model/scheduler.ts`) computes `fetchWaitMs` per task as it assigns slots,
and only then sets `finishMs = launchMs + baseMs + fetchWaitMs`.

**Implementation note — spill/GC land in two tickets.** `spillPenaltyMs` and `gcMs` are computed
by `packages/sim/model/memory.ts`. Until the spill & GC model ticket lands, that module returns
zero spill and zero GC for every task — a deliberate, documented placeholder, not a bug. The
additive formula shape and the eight term names above are fixed regardless of which ticket last
touched `memory.ts`.

**Spill.** Execution memory available to one task:

```
usableMiB   = executorMemoryMiB - 300                 // reserved
unifiedMiB  = usableMiB * memoryFraction
storageFloor= unifiedMiB * storageFraction
executionCeilingPerTask = (unifiedMiB - liveStorageMiB) / coresPerExecutor
```

`liveStorageMiB` is hardcoded to `0` in v1.0 — no persistent caching (`.cache()`/`.persist()`) is
modelled yet, so nothing ever occupies the storage region. `storageFloor` still exists and is
still computed, so the borrow/evict asymmetry below has a concrete floor to assert against even
though nothing currently lives above it. This is a v1.0 scope limit, not an oversight; a future
memory/caching module (M4, v2.0) is what gives `liveStorageMiB` a real producer.

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

## 2.5 Orchestration

Steps 2–6 are not a straight-line pipeline once AQE is involved: a rewrite fires *between*
stages, using the runtime stats of the stage that just completed, and can delete or replace
subtrees of the plan the next stage would otherwise have run against. `packages/sim/model/run.ts`
owns this control flow:

```ts
type RuntimeStats = { partitionBytes: Bytes[]; actualOtherSideBytes?: Bytes };
type AqeHook = (
  plan: PlanNode, stats: RuntimeStats, atMs: SimMs, producingStageId: number, config: RunConfig
) => { plan: PlanNode; rewrites: AqeRewrite[] };

function runQuery(config: RunConfig, seed: number, aqeHook: AqeHook): {
  stages: StageResult[]; tasks: TaskResult[];
  plan: { initial: PlanNode; final: PlanNode; rewrites: AqeRewrite[] };
}
```

Loop, starting from the plan built in Step 2:

1. Find the next runnable stage by walking the **current** tree — the shallowest
   Exchange/BroadcastExchange whose children are all materialised. This must be recomputed each
   iteration, not precomputed once at t=0: `dynamicJoinSelection` can delete an entire
   Exchange+Sort subtree mid-run, so a stage list fixed before the first rewrite would be wrong
   after it.
2. Generate that stage's tasks (Step 4) and schedule them (Step 5), producing one `StageResult`
   and its `TaskResult[]`.
3. If `sql.adaptive.enabled`, call `aqeHook` with that stage's runtime stats and its `finishMs`.
   Record any `AqeRewrite`s and replace the working plan with the returned tree before continuing
   the loop. If adaptive execution is disabled, the hook is never called and rewrites is `[]` —
   this is the only place "disabling AQE produces zero rewrites" is enforced; the rewrite rules
   themselves have no concept of "enabled".
4. Repeat until no runnable stage remains.

## 3. Fixture snapping

Before simulating, `resolveRun(config)` checks the fixture index for a run whose config is within
ε of the requested one. If found, it returns the fixture with `provenance: 'measured'`. ε is
declared per knob in the module spec — for example M1 snaps when `|zipfAlpha − fixture.alpha| ≤ 0.05`
and every other knob matches exactly.

**The badge in the UI is driven by this and nothing else.** Never fake a `measured` badge.

**Where this lives.** `resolveRun` is not part of `packages/sim` — `packages/sim` may not depend
on `packages/fixtures` (see `.dependency-cruiser.cjs`, rule `sim-zero-workspace-deps`). It lives in
`packages/fixtures/resolve.ts` (which is allowed to depend on `@sas/sim` for `simulate()` and the
`RunResult` type — SAS-022), and wraps `simulate()`. `simulate()` itself always returns
`provenance: 'modeled'` and `fixtureId: undefined`; only the wrapper may override those two
fields, and only when it substitutes a genuine fixture. Its snapping index only ever contains
fixtures with `synthetic !== true` (see [FIXTURES.md](./FIXTURES.md) §4) — a synthetic fixture can
never make the UI show `MEASURED`.

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
