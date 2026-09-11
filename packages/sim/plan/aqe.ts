// SAS-017 — the three AQE rewrite rules, fixed order: skew split → coalesce → join selection.
// See docs/SIMULATOR_SPEC.md §2 Step 3.

import type { RuntimeStats } from '../model/run';
import type { AqeRewrite, PlanNode, RunConfig, SimMs } from '../types';

const BYTES_PER_MIB = 1024 * 1024;

interface RewriteResult {
  plan: PlanNode;
  rewrite?: AqeRewrite;
}

function median(sortedAscending: number[]): number {
  const n = sortedAscending.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? ((sortedAscending[mid - 1] ?? 0) + (sortedAscending[mid] ?? 0)) / 2 : (sortedAscending[mid] ?? 0);
}

/** The fact/map-side Exchange, reached via the first child at every level — see plan/build.ts. */
function findFactExchange(plan: PlanNode): PlanNode | undefined {
  let node: PlanNode | undefined = plan;
  while (node && node.kind !== 'Exchange') {
    node = node.children[0];
  }
  return node;
}

function replaceNode(root: PlanNode, targetId: number, replacement: PlanNode): PlanNode {
  if (root.id === targetId) return replacement;
  return { ...root, children: root.children.map((c) => replaceNode(c, targetId, replacement)) };
}

function findFirstScan(node: PlanNode | undefined): PlanNode | undefined {
  if (!node) return undefined;
  if (node.kind === 'Scan') return node;
  for (const child of node.children) {
    const found = findFirstScan(child);
    if (found) return found;
  }
  return undefined;
}

function maxNodeId(node: PlanNode): number {
  return node.children.reduce((max, c) => Math.max(max, maxNodeId(c)), node.id);
}

/**
 * Trigger: the largest partition exceeds `skewedPartitionThresholdMiB` AND
 * `skewedPartitionFactor` × the median. Effect: split it into `ceil(size / advisory)` sub-
 * partitions on the map-side Exchange.
 */
export function optimizeSkewedJoin(
  plan: PlanNode,
  stats: RuntimeStats,
  atMs: SimMs,
  producingStageId: number,
  config: RunConfig
): RewriteResult {
  if (!config.sql.adaptive.skewJoinEnabled) return { plan };

  const exchange = findFactExchange(plan);
  if (!exchange) return { plan };

  const bytes = stats.partitionBytes;
  if (bytes.length === 0) return { plan };

  const sorted = [...bytes].sort((a, b) => a - b);
  const med = median(sorted);
  const maxBytes = sorted[sorted.length - 1] ?? 0;
  const thresholdBytes = config.sql.adaptive.skewedPartitionThresholdMiB * BYTES_PER_MIB;

  if (maxBytes <= thresholdBytes || maxBytes <= config.sql.adaptive.skewedPartitionFactor * med) {
    return { plan };
  }

  const advisoryBytes = config.sql.adaptive.advisoryPartitionSizeMiB * BYTES_PER_MIB;
  const subPartitions = Math.max(1, Math.ceil(maxBytes / advisoryBytes));
  const newCount = bytes.length - 1 + subPartitions;

  const before = exchange;
  const after: PlanNode = { ...exchange, partitionCount: newCount };

  return {
    plan: replaceNode(plan, exchange.id, after),
    rewrite: {
      rule: 'optimizeSkewedJoin',
      atMs,
      producingStageId,
      description: `split the oversized partition (${(maxBytes / BYTES_PER_MIB).toFixed(0)} MiB) into ${subPartitions} sub-partitions`,
      before,
      after,
    },
  };
}

/**
 * Trigger: mean post-shuffle partition size < `advisoryPartitionSizeMiB`. Effect: merge
 * adjacent partitions on the map-side Exchange until each is roughly the advisory size.
 */
export function coalesceShufflePartitions(
  plan: PlanNode,
  stats: RuntimeStats,
  atMs: SimMs,
  producingStageId: number,
  config: RunConfig
): RewriteResult {
  if (!config.sql.adaptive.coalescePartitions) return { plan };

  const exchange = findFactExchange(plan);
  if (!exchange) return { plan };

  const bytes = stats.partitionBytes;
  if (bytes.length === 0) return { plan };

  const totalBytes = bytes.reduce((sum, b) => sum + b, 0);
  const meanBytes = totalBytes / bytes.length;
  const advisoryBytes = config.sql.adaptive.advisoryPartitionSizeMiB * BYTES_PER_MIB;

  if (meanBytes >= advisoryBytes) return { plan };

  const newCount = Math.max(1, Math.min(bytes.length - 1, Math.round(totalBytes / advisoryBytes) || 1));
  if (newCount >= bytes.length) return { plan };

  const before = exchange;
  const after: PlanNode = { ...exchange, partitionCount: newCount };

  return {
    plan: replaceNode(plan, exchange.id, after),
    rewrite: {
      rule: 'coalesceShufflePartitions',
      atMs,
      producingStageId,
      description: `coalesced ${bytes.length} → ${newCount} partitions`,
      before,
      after,
    },
  };
}

/**
 * Trigger: the join's materialised dimension-side size ≤ `autoBroadcastJoinThresholdMiB`.
 * Effect: replace `SortMergeJoin` with `BroadcastHashJoin`, dropping one `Exchange` and both
 * `Sort` nodes.
 */
export function dynamicJoinSelection(
  plan: PlanNode,
  stats: RuntimeStats,
  atMs: SimMs,
  producingStageId: number,
  config: RunConfig
): RewriteResult {
  if (plan.kind !== 'SortMergeJoin') return { plan };

  const otherActualBytes = stats.actualOtherSideBytes;
  if (otherActualBytes === undefined) return { plan };

  const thresholdBytes = config.sql.autoBroadcastJoinThresholdMiB * BYTES_PER_MIB;
  if (otherActualBytes > thresholdBytes) return { plan };

  const fact = findFirstScan(plan.children[0]);
  const other = findFirstScan(plan.children[1]);
  if (!fact || !other) return { plan };

  const nextId = maxNodeId(plan) + 1;
  const broadcast: PlanNode = { id: nextId, kind: 'BroadcastExchange', children: [other], stageId: other.stageId };
  const after: PlanNode = {
    id: nextId + 1,
    kind: 'BroadcastHashJoin',
    children: [fact, broadcast],
    stageId: plan.stageId,
  };

  return {
    plan: after,
    rewrite: {
      rule: 'dynamicJoinSelection',
      atMs,
      producingStageId,
      description: 'replaced SortMergeJoin with BroadcastHashJoin — the materialised side turned out small enough to broadcast',
      before: plan,
      after,
    },
  };
}

/** Applies the three rules in the fixed order the spec requires. */
export function applyAqeRewrites(
  plan: PlanNode,
  stats: RuntimeStats,
  atMs: SimMs,
  producingStageId: number,
  config: RunConfig
): { plan: PlanNode; rewrites: AqeRewrite[] } {
  const rewrites: AqeRewrite[] = [];
  let current = plan;

  const skew = optimizeSkewedJoin(current, stats, atMs, producingStageId, config);
  current = skew.plan;
  if (skew.rewrite) rewrites.push(skew.rewrite);

  const coalesced = coalesceShufflePartitions(current, stats, atMs, producingStageId, config);
  current = coalesced.plan;
  if (coalesced.rewrite) rewrites.push(coalesced.rewrite);

  const joinSwitch = dynamicJoinSelection(current, stats, atMs, producingStageId, config);
  current = joinSwitch.plan;
  if (joinSwitch.rewrite) rewrites.push(joinSwitch.rewrite);

  return { plan: current, rewrites };
}
