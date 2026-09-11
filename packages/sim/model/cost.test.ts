import { describe, expect, it } from 'vitest';
import type { PartitionStats } from '../skew/partition';
import type { PlanNode } from '../types';
import { asBytes } from '../types';
import { computeTaskCost } from './cost';
import { DEFAULT_RUN_CONFIG } from './config';

const scanNode: PlanNode = { id: 0, kind: 'Scan', children: [], stageId: 0 };
const sortNode: PlanNode = { id: 1, kind: 'Sort', children: [], stageId: 1 };
const aggregateNode: PlanNode = { id: 2, kind: 'Aggregate', children: [], stageId: 1 };
const broadcastJoinNode: PlanNode = { id: 3, kind: 'BroadcastHashJoin', children: [], stageId: 1 };

const partition: PartitionStats = { rows: 10_000, bytes: asBytes(1_280_000) };

describe('computeTaskCost', () => {
  it('a map task pays read + shuffle-write, never sort or shuffle-read', () => {
    const cost = computeTaskCost(scanNode, partition, DEFAULT_RUN_CONFIG, 'map');
    expect(cost.shuffleWriteBytes).toBe(partition.bytes);
    expect(cost.shuffleReadBytes).toBe(0);
    expect(cost.baseMs).toBeGreaterThan(0);
  });

  it('a reduce task pays shuffle-read (accounted by inputBytes), never a raw read term', () => {
    const costMap = computeTaskCost(scanNode, partition, DEFAULT_RUN_CONFIG, 'map');
    const costReduce = computeTaskCost(aggregateNode, partition, DEFAULT_RUN_CONFIG, 'reduce');
    expect(costReduce.shuffleReadBytes).toBe(partition.bytes);
    expect(costReduce.shuffleWriteBytes).toBe(0);
    // The map task's baseMs includes a readMs term the reduce task's does not.
    expect(costMap.baseMs).not.toBe(costReduce.baseMs);
  });

  it('only Sort/SortMergeJoin reduce tasks pay a sort cost', () => {
    const withSort = computeTaskCost(sortNode, partition, DEFAULT_RUN_CONFIG, 'reduce');
    const withoutSort = computeTaskCost(aggregateNode, partition, DEFAULT_RUN_CONFIG, 'reduce');
    expect(withSort.baseMs).toBeGreaterThan(withoutSort.baseMs);
  });

  it('a BroadcastHashJoin reduce task never charges shuffle-read', () => {
    const cost = computeTaskCost(broadcastJoinNode, partition, DEFAULT_RUN_CONFIG, 'reduce');
    expect(cost.shuffleReadBytes).toBe(0);
  });

  it('is additive: baseMs scales up when rows scale up (holding shape fixed)', () => {
    const small = computeTaskCost(scanNode, { rows: 1000, bytes: asBytes(128_000) }, DEFAULT_RUN_CONFIG, 'map');
    const large = computeTaskCost(scanNode, { rows: 100_000, bytes: asBytes(12_800_000) }, DEFAULT_RUN_CONFIG, 'map');
    expect(large.baseMs).toBeGreaterThan(small.baseMs);
  });

  it('an empty partition still returns a valid, non-negative cost', () => {
    const cost = computeTaskCost(scanNode, { rows: 0, bytes: asBytes(0) }, DEFAULT_RUN_CONFIG, 'map');
    expect(cost.baseMs).toBeGreaterThanOrEqual(0);
    expect(cost.status).toBe('ok');
  });
});
