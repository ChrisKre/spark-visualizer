import { describe, expect, it } from 'vitest';
import type { RuntimeStats } from '../model/run';
import { testConfig } from '../model/test-helpers';
import { asBytes, asSimMs, type Bytes } from '../types';
import { applyAqeRewrites, coalesceShufflePartitions, dynamicJoinSelection, optimizeSkewedJoin } from './aqe';
import { buildPlan } from './build';

// A large "other" side so buildPlan produces a real SortMergeJoin (with an Exchange to
// coalesce/skew-split), not a broadcast join.
const shuffledJoinConfig = testConfig({
  query: { kind: 'join', joinType: 'inner', other: { rows: 50_000_000, bytesPerRow: 128 } },
});

const mib = (n: number): Bytes => asBytes(n * 1024 * 1024);

describe('optimizeSkewedJoin', () => {
  const plan = buildPlan(shuffledJoinConfig.query, shuffledJoinConfig);

  it('fires when the max partition exceeds both the threshold and the skew factor', () => {
    const stats: RuntimeStats = { partitionBytes: [mib(10), mib(10), mib(400)] }; // >256 MiB, >5x median(10)
    const result = optimizeSkewedJoin(plan, stats, asSimMs(100), 0, shuffledJoinConfig);
    expect(result.rewrite?.rule).toBe('optimizeSkewedJoin');
    expect(result.rewrite?.atMs).toBe(100);
    expect(result.rewrite?.producingStageId).toBe(0);
  });

  it('does not fire when under the threshold, even if far above the median', () => {
    const stats: RuntimeStats = { partitionBytes: [mib(1), mib(1), mib(50)] }; // 50 MiB < 256 MiB threshold
    const result = optimizeSkewedJoin(plan, stats, asSimMs(100), 0, shuffledJoinConfig);
    expect(result.rewrite).toBeUndefined();
  });

  it('does not fire when over the threshold but not skewed relative to the median', () => {
    const stats: RuntimeStats = { partitionBytes: [mib(300), mib(300), mib(300)] }; // over threshold, not skewed
    const result = optimizeSkewedJoin(plan, stats, asSimMs(100), 0, shuffledJoinConfig);
    expect(result.rewrite).toBeUndefined();
  });

  it('does not fire when skewJoinEnabled is false', () => {
    const cfg = testConfig({
      query: shuffledJoinConfig.query,
      sql: { adaptive: { skewJoinEnabled: false } },
    });
    const stats: RuntimeStats = { partitionBytes: [mib(10), mib(10), mib(400)] };
    const result = optimizeSkewedJoin(buildPlan(cfg.query, cfg), stats, asSimMs(100), 0, cfg);
    expect(result.rewrite).toBeUndefined();
  });
});

describe('coalesceShufflePartitions', () => {
  const plan = buildPlan(shuffledJoinConfig.query, shuffledJoinConfig);

  it('fires when the mean partition size is below the advisory size', () => {
    const stats: RuntimeStats = { partitionBytes: Array.from({ length: 200 }, () => mib(1)) }; // well under 64 MiB
    const result = coalesceShufflePartitions(plan, stats, asSimMs(50), 0, shuffledJoinConfig);
    expect(result.rewrite?.rule).toBe('coalesceShufflePartitions');
    // children[0] is the fact-side Sort; its child is the Exchange that carries partitionCount.
    expect(result.plan.children[0]?.children[0]?.partitionCount).toBeLessThan(200);
  });

  it('does not fire when the mean partition size is at or above the advisory size', () => {
    const stats: RuntimeStats = { partitionBytes: Array.from({ length: 200 }, () => mib(100)) };
    const result = coalesceShufflePartitions(plan, stats, asSimMs(50), 0, shuffledJoinConfig);
    expect(result.rewrite).toBeUndefined();
  });

  it('does not fire when coalescePartitions is false', () => {
    const cfg = testConfig({ query: shuffledJoinConfig.query, sql: { adaptive: { coalescePartitions: false } } });
    const stats: RuntimeStats = { partitionBytes: Array.from({ length: 200 }, () => mib(1)) };
    const result = coalesceShufflePartitions(buildPlan(cfg.query, cfg), stats, asSimMs(50), 0, cfg);
    expect(result.rewrite).toBeUndefined();
  });
});

describe('dynamicJoinSelection', () => {
  const plan = buildPlan(shuffledJoinConfig.query, shuffledJoinConfig);

  it('fires when the actual other-side size is small enough to broadcast', () => {
    const stats: RuntimeStats = { partitionBytes: [mib(10)], actualOtherSideBytes: mib(1) };
    const result = dynamicJoinSelection(plan, stats, asSimMs(75), 0, shuffledJoinConfig);
    expect(result.rewrite?.rule).toBe('dynamicJoinSelection');
    expect(result.plan.kind).toBe('BroadcastHashJoin');
  });

  it('does not fire when the actual other-side size is still large', () => {
    const stats: RuntimeStats = { partitionBytes: [mib(10)], actualOtherSideBytes: mib(1000) };
    const result = dynamicJoinSelection(plan, stats, asSimMs(75), 0, shuffledJoinConfig);
    expect(result.rewrite).toBeUndefined();
    expect(result.plan.kind).toBe('SortMergeJoin');
  });

  it('does not fire on a plan that is not a SortMergeJoin', () => {
    const aggConfig = testConfig({ query: { kind: 'aggregate' } });
    const aggPlan = buildPlan(aggConfig.query, aggConfig);
    const stats: RuntimeStats = { partitionBytes: [mib(1)], actualOtherSideBytes: mib(1) };
    const result = dynamicJoinSelection(aggPlan, stats, asSimMs(75), 0, aggConfig);
    expect(result.rewrite).toBeUndefined();
  });
});

describe('applyAqeRewrites — fixed order and disabled behaviour', () => {
  it('runs skew split, then coalesce, then join selection', () => {
    // A config where all three would trigger: skewed + small partitions on average + a small
    // enough actual other-side. Assert order via the rewrites array, not just the end state.
    const cfg = testConfig({
      query: { kind: 'join', joinType: 'inner', other: { rows: 50_000_000, bytesPerRow: 128 }, estimateErrorFactor: 1000 },
      sql: {
        adaptive: {
          enabled: true,
          skewJoinEnabled: true,
          coalescePartitions: true,
          advisoryPartitionSizeMiB: 64,
          skewedPartitionThresholdMiB: 10,
          skewedPartitionFactor: 2,
        },
      },
    });
    const plan = buildPlan(cfg.query, cfg);
    const stats: RuntimeStats = {
      partitionBytes: [mib(1), mib(1), mib(50)], // skewed AND mean well under advisory (64 MiB)
      actualOtherSideBytes: mib(1), // tiny actual size -> join selection should also fire
    };
    const { rewrites } = applyAqeRewrites(plan, stats, asSimMs(10), 0, cfg);
    expect(rewrites.map((r) => r.rule)).toEqual(['optimizeSkewedJoin', 'coalesceShufflePartitions', 'dynamicJoinSelection']);
  });

  it('produces zero rewrites when nothing triggers', () => {
    const plan = buildPlan(shuffledJoinConfig.query, shuffledJoinConfig);
    const stats: RuntimeStats = { partitionBytes: Array.from({ length: 200 }, () => mib(100)) }; // healthy, no rewrites
    const { rewrites } = applyAqeRewrites(plan, stats, asSimMs(10), 0, shuffledJoinConfig);
    expect(rewrites).toEqual([]);
  });
});
