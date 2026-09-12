// SAS-013 — plan model + join strategy selection. See docs/SIMULATOR_SPEC.md §2 Step 2.
//
// v1.0's QuerySpecs each produce a plan with exactly two "stages" once `assignStageIds` runs: a
// map stage (every Scan/Exchange/BroadcastExchange, stageId 0) and one terminal reduce stage
// (everything else — Sort/Aggregate/Project/the three join kinds — stageId 1). The dimension
// ("other") side of a join exists in the tree for the PlanTree visualisation and for join-
// strategy selection below, but never gets its own TaskResult set — see
// docs/SIMULATOR_SPEC.md §2 Step 4 and `packages/sim/model/run.ts`.

import type { Bytes, PlanNode, PlanNodeKind, QuerySpec, RunConfig } from '../types';
import { asBytes } from '../types';

const BYTES_PER_MIB = 1024 * 1024;

// Spark doesn't publish one universal "small enough for ShuffledHashJoin" number — empirically
// it tracks a build-side hash-map size a few times the broadcast threshold. This factor is a
// documented modelling simplification, not a fitted calibration constant.
const SHUFFLED_HASH_JOIN_SIZE_FACTOR = 3;

export function selectJoinStrategy(
  otherEstimatedBytes: Bytes,
  config: RunConfig,
  preferSortMergeJoin: boolean,
  broadcastHint?: boolean
): 'BroadcastHashJoin' | 'ShuffledHashJoin' | 'SortMergeJoin' {
  const thresholdBytes = config.sql.autoBroadcastJoinThresholdMiB * BYTES_PER_MIB;

  if (broadcastHint === true || otherEstimatedBytes <= thresholdBytes) {
    return 'BroadcastHashJoin';
  }
  if (!preferSortMergeJoin && otherEstimatedBytes <= thresholdBytes * SHUFFLED_HASH_JOIN_SIZE_FACTOR) {
    return 'ShuffledHashJoin';
  }
  return 'SortMergeJoin';
}

/**
 * Assigns `stageId` to every node in the tree: `Scan`/`Exchange`/`BroadcastExchange` are always
 * stage 0 (the map stage); everything else is stage 1 (the terminal reduce stage). See the file
 * header for why this binary rule is enough for every v1.0 `QuerySpec`.
 */
export function assignStageIds(root: PlanNode): PlanNode {
  const MAP_STAGE_KINDS: ReadonlySet<PlanNodeKind> = new Set(['Scan', 'Exchange', 'BroadcastExchange']);

  const assign = (node: PlanNode): PlanNode => ({
    ...node,
    stageId: MAP_STAGE_KINDS.has(node.kind) ? 0 : 1,
    children: node.children.map(assign),
  });

  return assign(root);
}

/** Builds the physical plan tree for `query`. Node ids are assigned in a fixed traversal order,
 * so the same `(query, config)` always produces the same tree — required for determinism. */
export function buildPlan(query: QuerySpec, config: RunConfig): PlanNode {
  let nextId = 0;
  const newId = (): number => nextId++;

  const fact: PlanNode = {
    id: newId(),
    kind: 'Scan',
    children: [],
    stageId: 0,
    estimatedSizeBytes: asBytes(config.data.rows * config.data.bytesPerRow),
  };

  const shuffle = (scan: PlanNode, addSort: boolean): PlanNode => {
    const exchange: PlanNode = {
      id: newId(),
      kind: 'Exchange',
      children: [scan],
      stageId: 0,
      partitionCount: config.sql.shufflePartitions,
    };
    return addSort ? { id: newId(), kind: 'Sort', children: [exchange], stageId: 0 } : exchange;
  };

  let root: PlanNode;

  switch (query.kind) {
    case 'aggregate': {
      const exchange = shuffle(fact, false);
      root = { id: newId(), kind: 'Aggregate', children: [exchange], stageId: 0 };
      break;
    }

    case 'window': {
      // Reserved for M3/v1.1 — a structurally valid Scan → Exchange → Project placeholder so
      // the pipeline never crashes if this kind is exercised early.
      const exchange = shuffle(fact, false);
      root = { id: newId(), kind: 'Project', children: [exchange], stageId: 0 };
      break;
    }

    case 'join': {
      const otherEstimatedBytes = asBytes(
        Math.round(query.other.rows * query.other.bytesPerRow * (query.estimateErrorFactor ?? 1))
      );
      const other: PlanNode = {
        id: newId(),
        kind: 'Scan',
        children: [],
        stageId: 0,
        estimatedSizeBytes: otherEstimatedBytes,
      };

      const strategy = selectJoinStrategy(otherEstimatedBytes, config, false, query.broadcastHint);

      if (strategy === 'BroadcastHashJoin') {
        const broadcast: PlanNode = { id: newId(), kind: 'BroadcastExchange', children: [other], stageId: 0 };
        root = { id: newId(), kind: 'BroadcastHashJoin', children: [fact, broadcast], stageId: 0 };
      } else {
        const left = shuffle(fact, strategy === 'SortMergeJoin');
        const right = shuffle(other, strategy === 'SortMergeJoin');
        root = { id: newId(), kind: strategy, children: [left, right], stageId: 0 };
      }
      break;
    }
  }

  return assignStageIds(root);
}
