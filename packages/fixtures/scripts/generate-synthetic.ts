// SAS-023/024 — generates the 15-fixture M1+M2 grid as SYNTHETIC stand-ins for a real capture
// session. Run with `pnpm --filter @sas/fixtures run generate:synthetic`.
//
// Why synthetic: this environment has no reachable Spark cluster (see tools/capture/README.md's
// SAS-020 note). Every fixture produced here is `synthetic: true` and carries a `notes` string
// saying so — `resolve.ts` excludes synthetic fixtures from its snapping index by construction,
// so these can never make the UI show `MEASURED`. A real-cluster follow-up replaces these files
// 1:1 by id and re-runs calibrate.py.
//
// Method: call `simulate()` (the real cost model + scheduler) for each config, then inject
// per-task jitter so calibrate.py and the "never smooth" rounding rule have real texture to work
// against, rather than perfectly smooth modelled numbers.
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_RUN_CONFIG, simulate } from '@sas/sim';
import type { RunConfig, StageResult, TaskResult } from '@sas/sim';
import { validateFixture } from '../schema';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const MAX_GZIPPED_BYTES = 400 * 1024; // docs/CONTRIBUTING.md performance gate

// ---------------------------------------------------------------------------------------------
// Deterministic helpers — a fixture's simulate() seed and its jitter stream must both be
// reproducible so re-running this script without a code change produces byte-identical fixtures.
// ---------------------------------------------------------------------------------------------

/** FNV-1a, 32-bit — mirrors packages/sim/model/run.golden.test.ts's hash, reused here only to
 * turn a fixture id into a deterministic numeric seed (not for hashing output). */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** D7 — a local mulberry32, deliberately not deep-imported from packages/sim/skew/prng.ts (not
 * part of @sas/sim's public API). Algorithm mirrors it exactly. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniform draw in `[1 - amplitude, 1 + amplitude]`, e.g. amplitude 0.08 for ±8%. */
function jitterFactor(rng: () => number, amplitude: number): number {
  return 1 + amplitude * (rng() * 2 - 1);
}

const KIB = 1024;
const roundToKiB = (n: number): number => Math.round(n / KIB) * KIB;
const roundMs = (n: number): number => Math.round(n);

// ---------------------------------------------------------------------------------------------
// RunConfig construction — a local deep-merge helper mirroring
// packages/sim/model/test-helpers.ts's testConfig shape. Duplicated rather than imported: that
// file is explicitly "not part of the public API (not re-exported from index.ts)".
// ---------------------------------------------------------------------------------------------

interface ConfigOverrides {
  cluster?: Partial<RunConfig['cluster']>;
  sql?: Partial<Omit<RunConfig['sql'], 'adaptive'>> & { adaptive?: Partial<RunConfig['sql']['adaptive']> };
  data?: Partial<RunConfig['data']>;
  query?: RunConfig['query'];
}

function buildConfig(overrides: ConfigOverrides = {}): RunConfig {
  return {
    cluster: { ...DEFAULT_RUN_CONFIG.cluster, ...overrides.cluster },
    sql: {
      ...DEFAULT_RUN_CONFIG.sql,
      ...overrides.sql,
      adaptive: { ...DEFAULT_RUN_CONFIG.sql.adaptive, ...overrides.sql?.adaptive },
    },
    data: { ...DEFAULT_RUN_CONFIG.data, ...overrides.data },
    query: overrides.query ?? DEFAULT_RUN_CONFIG.query,
  };
}

// A large enough "other" side that the join actually shuffles (SortMergeJoin, with an Exchange
// for AQE's coalesce/skew-split rules to act on) instead of defaulting to a broadcast join —
// mirrors packages/sim/model/canonical-configs.ts's shuffledJoinQuery/data shape, chosen there
// "to mirror the coverage shape of the E3 fixture grid" in the first place.
const shuffledJoinQuery: RunConfig['query'] = {
  kind: 'join',
  joinType: 'inner',
  other: { rows: 2_000_000, bytesPerRow: 128 },
};
const m1Data = { rows: 2_000_000, keyCardinality: 200, bytesPerRow: 2000 };

// A materially wrong planner estimate: the "other" side is genuinely tiny (~0.12 MiB) but the
// estimate is off by 100000x, forcing SortMergeJoin at plan time — mirrors canonical-configs.ts's
// 'aqe-join-switch'.
const badEstimateQuery: RunConfig['query'] = {
  kind: 'join',
  joinType: 'inner',
  other: { rows: 1000, bytesPerRow: 128 },
  estimateErrorFactor: 100_000,
};

interface FixtureSpec {
  id: string;
  config: RunConfig;
  notes: string;
  pairedWith?: string;
}

const M1_GRID: FixtureSpec[] = [
  { id: 'm1_a00_s1', config: buildConfig({ query: shuffledJoinQuery, data: { ...m1Data, zipfAlpha: 0, saltFactor: 1 } }), notes: 'uniform baseline' },
  { id: 'm1_a08_s1', config: buildConfig({ query: shuffledJoinQuery, data: { ...m1Data, zipfAlpha: 0.8, saltFactor: 1 } }), notes: 'mild skew' },
  { id: 'm1_a12_s1', config: buildConfig({ query: shuffledJoinQuery, data: { ...m1Data, zipfAlpha: 1.2, saltFactor: 1 } }), notes: 'visible straggler' },
  {
    id: 'm1_a16_s1',
    config: buildConfig({ query: shuffledJoinQuery, data: { ...m1Data, zipfAlpha: 1.6, saltFactor: 1 } }),
    notes: 'the hero "before" — severe skew, no salting',
    pairedWith: 'm1_a16_s8',
  },
  { id: 'm1_a16_s4', config: buildConfig({ query: shuffledJoinQuery, data: { ...m1Data, zipfAlpha: 1.6, saltFactor: 4 } }), notes: 'partial fix' },
  {
    id: 'm1_a16_s8',
    config: buildConfig({ query: shuffledJoinQuery, data: { ...m1Data, zipfAlpha: 1.6, saltFactor: 8 } }),
    notes: 'the hero "after" — salting fixes the straggler',
    pairedWith: 'm1_a16_s1',
  },
  {
    id: 'm1_a16_null3',
    config: buildConfig({ query: shuffledJoinQuery, data: { ...m1Data, zipfAlpha: 1.6, saltFactor: 1, nullFraction: 0.03 } }),
    notes: '3% null keys, no salt — the trap: salting alone will not fix this',
  },
  { id: 'm1_a20_s8', config: buildConfig({ query: shuffledJoinQuery, data: { ...m1Data, zipfAlpha: 2.0, saltFactor: 8 } }), notes: 'salting is not enough' },
];

const M2_GRID: FixtureSpec[] = [
  {
    id: 'm2_off',
    config: buildConfig({ query: badEstimateQuery, data: { ...m1Data, zipfAlpha: 0 }, sql: { adaptive: { enabled: false } } }),
    notes: 'AQE off, bad estimate — the plan is stuck with the SortMergeJoin a wrong estimate produced',
  },
  {
    id: 'm2_coalesce_only',
    config: buildConfig({
      query: shuffledJoinQuery,
      data: { ...m1Data, zipfAlpha: 0, rows: 50_000 },
      sql: { shufflePartitions: 200, adaptive: { advisoryPartitionSizeMiB: 64 } },
    }),
    notes: 'AQE on, coalesce only, no skew, accurate estimate',
  },
  {
    id: 'm2_skew_split',
    config: buildConfig({
      query: shuffledJoinQuery,
      data: { rows: 20_000_000, keyCardinality: 200, bytesPerRow: 2000, zipfAlpha: 2.2, nullFraction: 0, saltFactor: 1 },
      sql: { adaptive: { skewJoinEnabled: true, skewedPartitionThresholdMiB: 1, skewedPartitionFactor: 2 } },
    }),
    notes: 'AQE on, skew join fires',
  },
  {
    id: 'm2_join_switch',
    config: buildConfig({ query: badEstimateQuery, data: { ...m1Data, zipfAlpha: 0 } }),
    notes: 'AQE on, SMJ -> BHJ switch fires',
  },
  {
    id: 'm2_all',
    // Same bad-estimate query as m2_join_switch (so dynamicJoinSelection fires) layered on
    // m2_skew_split's skewed, small-mean-partition-size data (so both optimizeSkewedJoin and
    // coalesceShufflePartitions also fire) — the hero run where all three AQE rules fire on one
    // clock.
    config: buildConfig({
      query: badEstimateQuery,
      data: { ...m1Data, zipfAlpha: 2.2, saltFactor: 1 },
      sql: { adaptive: { skewedPartitionThresholdMiB: 1, skewedPartitionFactor: 2 } },
    }),
    notes: 'all three AQE rules fire — the hero run',
  },
  {
    id: 'm2_adv8',
    config: buildConfig({
      query: shuffledJoinQuery,
      data: { ...m1Data, zipfAlpha: 0, rows: 50_000 },
      sql: { shufflePartitions: 200, adaptive: { advisoryPartitionSizeMiB: 8 } },
    }),
    notes: 'advisory size at the low end, for calibration',
  },
  {
    id: 'm2_adv256',
    config: buildConfig({
      query: shuffledJoinQuery,
      data: { ...m1Data, zipfAlpha: 0, rows: 50_000 },
      sql: { shufflePartitions: 200, adaptive: { advisoryPartitionSizeMiB: 256 } },
    }),
    notes: 'advisory size at the high end, for calibration',
  },
];

// ---------------------------------------------------------------------------------------------
// Jitter — applied after simulate(), so calibrate.py and the rounding rule have real texture.
// ---------------------------------------------------------------------------------------------

function jitterTasks(tasks: TaskResult[], config: RunConfig, jitterSeed: number): Array<TaskResult & { rows: number }> {
  const rng = mulberry32(jitterSeed);

  return tasks.map((task) => {
    // D2 — true row count, derived from the pre-jitter (exact) inputBytes. After a skew-split's
    // independent floor-rounding of rows vs. bytes (packages/sim/model/run.ts's split()), this
    // can be off by at most one row — an accepted approximation for synthetic calibration data.
    const rows = Math.round(task.inputBytes / config.data.bytesPerRow);

    // Jitter baseMs alone (finishMs - launchMs - fetchWaitMs), not the combined duration —
    // fetchWaitMs is scheduler-determined (packages/sim/model/scheduler.ts), not part of the
    // additive cost model, and calibrate.py relies on `finishMs - launchMs - fetchWaitMs` being
    // non-negative to recover it. Jittering the combined value and leaving fetchWaitMs untouched
    // can otherwise push that difference negative whenever fetchWaitMs is a large share of the
    // total (a real bug caught by running calibrate.py against this generator's own output).
    // Amplitude note: a stage's wall clock is the MAX over every task in it, and a map stage's
    // ~200 tasks are close enough in size that independent per-task jitter measurably lifts the
    // observed max above the model's (unjittered) prediction — an order-statistics effect of
    // "many similarly-sized candidates for the max", not a cost-model error. A ±8% duration
    // amplitude (this file's first cut) inflated stage-0 wall clock by 25-90% this way, which no
    // per-task regression can correct because it isn't a per-task bias. Kept small enough here
    // that this effect stays well under the calibration MAE gate while still giving calibrate.py
    // real (non-zero) texture to fit.
    const baseMs = task.finishMs - task.launchMs - task.fetchWaitMs;
    const jitteredBaseMs = Math.max(0, baseMs * jitterFactor(rng, 0.02));
    const finishMs = roundMs(task.launchMs + task.fetchWaitMs + jitteredBaseMs);

    return {
      ...task,
      finishMs,
      inputBytes: roundToKiB(task.inputBytes * jitterFactor(rng, 0.02)),
      shuffleReadBytes: roundToKiB(task.shuffleReadBytes * jitterFactor(rng, 0.02)),
      shuffleWriteBytes: roundToKiB(task.shuffleWriteBytes * jitterFactor(rng, 0.02)),
      memorySpilledBytes: roundToKiB(task.memorySpilledBytes * jitterFactor(rng, 0.02)),
      diskSpilledBytes: roundToKiB(task.diskSpilledBytes * jitterFactor(rng, 0.02)),
      peakExecutionMemoryBytes: roundToKiB(task.peakExecutionMemoryBytes * jitterFactor(rng, 0.02)),
      // GC is deliberately the noisiest field — matches FIXTURES.md's own "jvm gc time ...
      // worst; documented as a known weakness" precedent for real captures.
      gcMs: roundMs(task.gcMs * jitterFactor(rng, 0.05)),
      rows,
    } as TaskResult & { rows: number };
  }) as Array<TaskResult & { rows: number }>;
}

/** Recomputes each stage's launchMs/finishMs as min/max over its (now jittered) tasks — never
 * the sum. See packages/sim/model/scheduler.ts's own invariant. */
function recomputeStages(stages: StageResult[], tasks: TaskResult[]): StageResult[] {
  return stages.map((stage) => {
    const stageTasks = stage.taskIds.map((taskId) => tasks.find((t) => t.taskId === taskId)).filter((t): t is TaskResult => t !== undefined);
    return {
      ...stage,
      launchMs: Math.min(...stageTasks.map((t) => t.launchMs)),
      finishMs: Math.max(...stageTasks.map((t) => t.finishMs)),
    };
  }) as StageResult[];
}

function buildFixture(spec: FixtureSpec): Record<string, unknown> {
  const seed = fnv1a(spec.id);
  const jitterSeed = fnv1a(`${spec.id}:jitter`);
  const { stages: rawStages, tasks: rawTasks, plan } = simulate(spec.config, seed);

  const jitteredTasks = jitterTasks(rawTasks, spec.config, jitterSeed);
  const stages = recomputeStages(rawStages, jitteredTasks);

  // All v1.0 AQE rewrites fire at the single hook call between stage 0 and stage 1 — re-point
  // every rewrite's atMs at the (now jittered) stage 0 finish, per SIMULATOR_SPEC.md §2 Step 3
  // ("rewrites carry the clock position of the producing stage's completion").
  const stage0 = stages.find((s) => s.stageId === 0);
  const rewrites = plan.rewrites.map((r) => ({ ...r, atMs: stage0?.finishMs ?? r.atMs }));

  return {
    id: spec.id,
    schemaVersion: 1,
    captured: new Date().toISOString().slice(0, 10),
    environment: {
      sparkVersion: 'n/a (synthetic)',
      runtime: 'packages/sim simulate() + injected jitter',
      nodes: spec.config.cluster.executors,
      nodeType: 'synthetic',
      executorMemoryMiB: spec.config.cluster.executorMemoryMiB,
      coresPerExecutor: spec.config.cluster.coresPerExecutor,
    },
    config: {
      zipfAlpha: spec.config.data.zipfAlpha,
      saltFactor: spec.config.data.saltFactor,
      shufflePartitions: spec.config.sql.shufflePartitions,
      aqe: spec.config.sql.adaptive.enabled,
    },
    runConfig: spec.config,
    ...(spec.pairedWith ? { pairedWith: spec.pairedWith } : {}),
    notes: `SYNTHETIC — generated for pipeline testing, not a real Spark capture; see SAS-023/024 follow-up for real data. ${spec.notes}`,
    synthetic: true,
    sampling: { ratio: 1 },
    stages,
    tasks: jitteredTasks,
    plan: { initial: plan.initial, final: plan.final, rewrites },
  };
}

function main(): void {
  mkdirSync(DATA_DIR, { recursive: true });

  let anyOversize = false;
  for (const spec of [...M1_GRID, ...M2_GRID]) {
    const fixture = buildFixture(spec);
    validateFixture(fixture); // fail fast if the generator itself produced something invalid

    const json = JSON.stringify(fixture, null, 2);
    const path = join(DATA_DIR, `${spec.id}.json`);
    writeFileSync(path, json);

    const gzippedBytes = gzipSync(json).length;
    const sizeNote = gzippedBytes > MAX_GZIPPED_BYTES ? ' <-- EXCEEDS 400 kB GATE' : '';
    console.log(`${spec.id}: ${(gzippedBytes / 1024).toFixed(1)} kB gzipped${sizeNote}`);
    if (gzippedBytes > MAX_GZIPPED_BYTES) anyOversize = true;
  }

  if (anyOversize) {
    console.error('\nOne or more fixtures exceed the 400 kB gzipped gate (docs/CONTRIBUTING.md).');
    process.exit(1);
  }
  console.log(`\n${M1_GRID.length + M2_GRID.length} synthetic fixtures written to ${DATA_DIR}`);
}

main();
