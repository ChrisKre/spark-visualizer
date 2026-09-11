// SAS-016 — the orchestrator. See docs/SIMULATOR_SPEC.md §2.5 ("Orchestration").
//
// v1.0's QuerySpecs each produce a plan with exactly two stages (map = stageId 0, reduce =
// stageId 1 — see plan/build.ts), so this is written directly against that fixed shape rather
// than as a fully generic N-stage graph walker. AQE (SAS-017) fires exactly once, between the
// two stages, using stage 0's runtime stats.

import { buildPlan } from '../plan/build';
import { computePartitionSizes, type PartitionStats } from '../skew/partition';
import type { AqeRewrite, Bytes, PlanNode, RunConfig, SimMs, StageResult, TaskResult } from '../types';
import { asBytes, asSimMs } from '../types';
import * as K from '../calibration/constants.generated';
import { generateStageTasks } from './tasks';
import { scheduleStage } from './scheduler';

export interface RuntimeStats {
  partitionBytes: Bytes[];
  /** The join's dimension side's true materialised size — undefined for non-join queries.
   * Compared against the planner's (possibly wrong) estimate by `dynamicJoinSelection`. */
  actualOtherSideBytes?: Bytes;
}

export type AqeHook = (
  plan: PlanNode,
  stats: RuntimeStats,
  atMs: SimMs,
  producingStageId: number,
  config: RunConfig
) => { plan: PlanNode; rewrites: AqeRewrite[] };

/** Used until SAS-017 wires a real hook, and whenever AQE is disabled — see `runQuery` below. */
export const noopAqeHook: AqeHook = (plan) => ({ plan, rewrites: [] });

/** Walks down `children[0]` until reaching a stage-0 (map-side) node — the Exchange for a
 * shuffle-based plan, or the Scan itself for a broadcast join. See plan/build.ts. */
function findMapNode(plan: PlanNode): PlanNode {
  let node = plan;
  while (node.stageId !== 0) {
    const next = node.children[0];
    if (!next) break;
    node = next;
  }
  return node;
}

export interface RunQueryResult {
  stages: StageResult[];
  tasks: TaskResult[];
  plan: { initial: PlanNode; final: PlanNode; rewrites: AqeRewrite[] };
}

/**
 * Runs a query end to end: build the plan, generate + schedule the map stage, run AQE between
 * stages if enabled, then generate + schedule the reduce stage.
 */
export function runQuery(config: RunConfig, seed: number, aqeHook: AqeHook = noopAqeHook): RunQueryResult {
  const initial = buildPlan(config.query, config);
  let plan = initial;

  let partitions: PartitionStats[] = computePartitionSizes(config.data, config.sql.shufflePartitions, seed);
  const slots = Math.max(1, config.cluster.executors * config.cluster.coresPerExecutor);

  const mapNode = findMapNode(plan);
  const mapCosts = generateStageTasks(mapNode, partitions, config, 'map');
  const stage0 = scheduleStage(mapCosts, 0, mapNode.id, asSimMs(0), slots, K.NETWORK_BANDWIDTH_MBPS, 0);

  const rewrites: AqeRewrite[] = [];
  if (config.sql.adaptive.enabled) {
    const otherActualBytes =
      config.query.kind === 'join' ? asBytes(config.query.other.rows * config.query.other.bytesPerRow) : undefined;

    const result = aqeHook(
      plan,
      { partitionBytes: stage0.stage.partitionBytes, actualOtherSideBytes: otherActualBytes },
      stage0.stage.finishMs,
      0,
      config
    );
    plan = result.plan;
    rewrites.push(...result.rewrites);
    partitions = reconcilePartitions(partitions, plan);
  }

  const reduceNode = plan; // the tree root is always the terminal (reduce) node — see file header
  const reduceCosts = generateStageTasks(reduceNode, partitions, config, 'reduce');
  const stage1 = scheduleStage(
    reduceCosts,
    1,
    reduceNode.id,
    stage0.stage.finishMs,
    slots,
    K.NETWORK_BANDWIDTH_MBPS,
    stage0.tasks.length
  );

  return {
    stages: [stage0.stage, stage1.stage],
    tasks: [...stage0.tasks, ...stage1.tasks],
    plan: { initial, final: plan, rewrites },
  };
}

/**
 * Re-derives partition stats after an AQE rewrite changes the map-side Exchange's effective
 * partition count (coalesce shrinks it, skew-split grows it). A no-op whenever `plan` is
 * unchanged — true for `noopAqeHook` and for `applyAqeRewrites` when no rule fired.
 */
function reconcilePartitions(partitions: PartitionStats[], plan: PlanNode): PartitionStats[] {
  const mapNode = findMapNode(plan);
  const targetCount = mapNode.partitionCount ?? partitions.length;
  if (targetCount === partitions.length) return partitions;
  return targetCount < partitions.length ? coalesce(partitions, targetCount) : split(partitions, targetCount);
}

/** Merges adjacent partitions into `targetCount` groups, summing their rows/bytes exactly. */
function coalesce(partitions: PartitionStats[], targetCount: number): PartitionStats[] {
  if (targetCount <= 0) return partitions;
  const groupSize = Math.ceil(partitions.length / targetCount);
  const groups: PartitionStats[] = [];
  for (let i = 0; i < partitions.length; i += groupSize) {
    const group = partitions.slice(i, i + groupSize);
    groups.push({
      rows: group.reduce((sum, p) => sum + p.rows, 0),
      bytes: asBytes(group.reduce((sum, p) => sum + p.bytes, 0)),
    });
  }
  return groups;
}

/** Splits only the single largest partition into `targetCount - partitions.length + 1` equal
 * sub-partitions, leaving every other partition untouched — matches `optimizeSkewedJoin`, which
 * targets one oversized partition rather than redistributing everything. */
function split(partitions: PartitionStats[], targetCount: number): PartitionStats[] {
  if (targetCount <= partitions.length) return partitions;
  const largest = partitions.reduce((a, b) => (b.bytes > a.bytes ? b : a));
  const others = partitions.filter((p) => p !== largest);
  const subCount = targetCount - others.length;

  const subRows = Math.floor(largest.rows / subCount);
  const subBytes = Math.floor(largest.bytes / subCount);
  const subParts: PartitionStats[] = Array.from({ length: subCount }, (_, i) => ({
    rows: i === subCount - 1 ? largest.rows - subRows * (subCount - 1) : subRows,
    bytes: asBytes(i === subCount - 1 ? largest.bytes - subBytes * (subCount - 1) : subBytes),
  }));

  return [...others, ...subParts];
}
