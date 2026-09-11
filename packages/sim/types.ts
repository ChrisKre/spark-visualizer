// Branded unit types. Plain `number` cannot distinguish a millisecond count from a byte
// count from a mebibyte count, and unit confusion is the most likely correctness bug in
// this codebase (see docs/CONTRIBUTING.md — TypeScript conventions). Branding makes mixing
// them a compile error instead of a silent bug.
//
// These are nominal types: TypeScript's structural typing would otherwise treat any two
// `number` aliases as interchangeable, so each brand carries a unique, unused `__brand`
// tag that only the constructor functions below are allowed to attach.

type Brand<T, B extends string> = T & { readonly __brand: B };

/** A duration in the simulator's virtual clock — see ARCHITECTURE.md §4. */
export type SimMs = Brand<number, 'SimMs'>;

/** A duration in real wall-clock render time, after the clock's `speed` mapping. */
export type RenderMs = Brand<number, 'RenderMs'>;

/** A byte count, decimal-agnostic — format with MB/s (throughput) or MiB/GiB (size). */
export type Bytes = Brand<number, 'Bytes'>;

/** A size already expressed in mebibytes. Not interchangeable with a raw `Bytes` count. */
export type MiB = Brand<number, 'MiB'>;

// Constructor functions are the only sanctioned way to produce a branded value. Nothing
// else in the codebase should write a raw `as Bytes` / `as MiB` / ... cast — if you find
// yourself needing one, it is very likely a real unit bug, not a type-system nuisance.
export const asSimMs = (n: number): SimMs => n as SimMs;
export const asRenderMs = (n: number): RenderMs => n as RenderMs;
export const asBytes = (n: number): Bytes => n as Bytes;
export const asMiB = (n: number): MiB => n as MiB;

// ---------------------------------------------------------------------------------------
// Simulator public API types — see docs/SIMULATOR_SPEC.md §1 (normative; this file follows
// it, not the other way around — SAS-010).
// ---------------------------------------------------------------------------------------

/** `spark.*` cluster and SQL configuration, plus the synthetic dataset shape. */
export interface RunConfig {
  cluster: {
    /** Number of executors. Default 8. */
    executors: number;
    /** Cores per executor. `slots = executors * coresPerExecutor`. Default 4. */
    coresPerExecutor: number;
    /** `spark.executor.memory`, in MiB. Default 8192. */
    executorMemoryMiB: number;
    /** `spark.memory.fraction`. Default 0.6. */
    memoryFraction: number;
    /** `spark.memory.storageFraction`. Default 0.5. */
    storageFraction: number;
  };
  sql: {
    /** `spark.sql.shuffle.partitions`. Default 200. */
    shufflePartitions: number;
    /** `spark.sql.autoBroadcastJoinThreshold`, in MiB. Default 10. */
    autoBroadcastJoinThresholdMiB: number;
    adaptive: {
      /** `spark.sql.adaptive.enabled`. Default true (Spark 3.2+). */
      enabled: boolean;
      /** `spark.sql.adaptive.advisoryPartitionSizeInBytes`, in MiB. Default 64. */
      advisoryPartitionSizeMiB: number;
      /** `spark.sql.adaptive.coalescePartitions.enabled`. Default true. */
      coalescePartitions: boolean;
      /** `spark.sql.adaptive.skewJoin.enabled`. Default true. */
      skewJoinEnabled: boolean;
      /** `spark.sql.adaptive.skewJoin.skewedPartitionFactor`. Default 5. */
      skewedPartitionFactor: number;
      /** `spark.sql.adaptive.skewJoin.skewedPartitionThresholdInBytes`, in MiB. Default 256. */
      skewedPartitionThresholdMiB: number;
    };
  };
  data: {
    rows: number;
    keyCardinality: number;
    /** Zipf exponent. 0 = uniform; 1.6 ≈ top key owns ~50% of rows. */
    zipfAlpha: number;
    /** Fraction of rows with a null join/group key — all hash to one partition. */
    nullFraction: number;
    bytesPerRow: number;
    /** 1 = no salting. */
    saltFactor: number;
  };
  query: QuerySpec;
}

/** A logical/physical plan node kind. See docs/GLOSSARY.md for `Exchange`. */
export type PlanNodeKind =
  | 'Scan'
  | 'Exchange'
  | 'BroadcastExchange'
  | 'Sort'
  | 'Aggregate'
  | 'Project'
  | 'BroadcastHashJoin'
  | 'ShuffledHashJoin'
  | 'SortMergeJoin';

/**
 * A node in the physical plan tree. Ids are stable only within one snapshot
 * (`RunResult.plan.initial`, `.final`, or one side of an `AqeRewrite`) — a rewrite replaces a
 * subtree wholesale and produces new ids, never reuses old ones.
 */
export interface PlanNode {
  id: number;
  kind: PlanNodeKind;
  children: PlanNode[];
  /** Scan's stage is 0; increments at each Exchange/BroadcastExchange. */
  stageId: number;
  /** Planner-time guess. Deliberately allowed to be wrong — see SIMULATOR_SPEC.md §2 Step 2. */
  estimatedSizeBytes?: Bytes;
  /** Filled in once the producing stage has materialised. */
  actualSizeBytes?: Bytes;
  /** Shuffle partitions this node emits. Exchange only. */
  partitionCount?: number;
}

/**
 * The query to run. Intentionally minimal and left open for extension: v1.0 needs exactly the
 * M1 (skew + join) and M2 (AQE) shapes. `window` is reserved for M3/v1.1 and unused before then.
 */
export type QuerySpec =
  | { kind: 'aggregate' }
  | {
      kind: 'join';
      joinType: 'inner' | 'left';
      /** The dimension ("other") side of the join. `RunConfig.data` describes the fact side. */
      other: { rows: number; bytesPerRow: number };
      broadcastHint?: boolean;
      /**
       * Planner size-estimate error multiplier for `other`'s materialised size — a module knob
       * (M2's `est`), not a real Spark config. 1 = the planner's estimate is accurate.
       */
      estimateErrorFactor?: number;
    }
  | { kind: 'window'; partitionByKeyCardinality: number };

export interface TaskResult {
  taskId: number;
  stageId: number;
  slot: number;
  partitionId: number;
  launchMs: SimMs;
  finishMs: SimMs;
  inputBytes: Bytes;
  shuffleReadBytes: Bytes;
  shuffleWriteBytes: Bytes;
  fetchWaitMs: SimMs;
  gcMs: SimMs;
  memorySpilledBytes: Bytes;
  diskSpilledBytes: Bytes;
  peakExecutionMemoryBytes: Bytes;
  status: 'ok' | 'spilled' | 'oom';
}

export interface StageResult {
  stageId: number;
  /** The Exchange/BroadcastExchange this stage's output feeds. */
  planNodeId: number;
  taskIds: number[];
  /** min(launch) across this stage's tasks. */
  launchMs: SimMs;
  /** max(finish) across this stage's tasks — never the sum. See SIMULATOR_SPEC.md §2 Step 5. */
  finishMs: SimMs;
  /** 'failed' iff any task in the stage is 'oom'. */
  status: 'ok' | 'failed';
  /** Per-partition output size, in partition order. */
  partitionBytes: Bytes[];
}

export type WarningCode = 'oom' | 'excessive-gc' | 'idle-reducers' | 'high-spill';

export interface Warning {
  code: WarningCode;
  stageId?: number;
  message: string;
}

export interface AqeRewrite {
  rule: 'optimizeSkewedJoin' | 'coalesceShufflePartitions' | 'dynamicJoinSelection';
  /** The producing stage's finishMs — never t=0. */
  atMs: SimMs;
  producingStageId: number;
  /** e.g. "coalesced 200 → 17 partitions" — consumed verbatim by the PlanTree animation. */
  description: string;
  /** Outgoing subtree, for the rewrite animation. */
  before: PlanNode;
  /** Incoming subtree. */
  after: PlanNode;
}

export interface RunMetrics {
  wallClockMs: SimMs;
  cpuSeconds: number;
  /** max(taskMs) / median(taskMs). */
  stragglerRatio: number;
  shuffleReadBytes: Bytes;
  shuffleWriteBytes: Bytes;
  diskSpilledBytes: Bytes;
  memorySpilledBytes: Bytes;
  gcMs: SimMs;
  gcPercent: number;
  /** Partitions with zero rows. */
  idleReducers: number;
  /** v3. */
  estimatedCostUsd?: number;
}

export interface RunResult {
  /**
   * `simulate()` always returns 'modeled' with `fixtureId: undefined` — only a fixture-snapping
   * wrapper outside `packages/sim` (see SIMULATOR_SPEC.md §3) may override these two fields.
   */
  provenance: 'measured' | 'modeled';
  fixtureId?: string;
  stages: StageResult[];
  tasks: TaskResult[];
  plan: { initial: PlanNode; final: PlanNode; rewrites: AqeRewrite[] };
  metrics: RunMetrics;
  warnings: Warning[];
}
