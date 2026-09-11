import { describe, expect, it } from 'vitest';
import { applyAqeRewrites } from '../plan/aqe';
import { noopAqeHook, runQuery } from './run';
import { testConfig as config } from './test-helpers';

describe('runQuery', () => {
  it('produces exactly two stages for a join query', () => {
    const { stages } = runQuery(config(), 1, noopAqeHook);
    expect(stages.map((s) => s.stageId)).toEqual([0, 1]);
  });

  it('one task per partition per stage', () => {
    const cfg = config({ sql: { shufflePartitions: 32 } });
    const { stages, tasks } = runQuery(cfg, 1, noopAqeHook);
    expect(stages[0]?.taskIds.length).toBe(32);
    expect(stages[1]?.taskIds.length).toBe(32);
    expect(tasks.length).toBe(64);
  });

  it('is deterministic for the same (config, seed)', () => {
    const a = runQuery(config(), 42, noopAqeHook);
    const b = runQuery(config(), 42, noopAqeHook);
    expect(a).toEqual(b);
  });

  it('with adaptive.enabled=false, the hook is never invoked (zero rewrites)', () => {
    const cfg = config({ sql: { adaptive: { enabled: false } } });
    let called = false;
    const { plan } = runQuery(cfg, 1, () => {
      called = true;
      return { plan: undefined as never, rewrites: [] };
    });
    expect(called).toBe(false);
    expect(plan.rewrites).toEqual([]);
  });

  it('AQE fires between stage 0 and stage 1: rewrite atMs equals stage 0 finishMs', () => {
    const cfg = config({
      sql: {
        shufflePartitions: 200,
        adaptive: { enabled: true, coalescePartitions: true, skewJoinEnabled: true, advisoryPartitionSizeMiB: 999_999 },
      },
      data: { rows: 100, keyCardinality: 5, bytesPerRow: 10 }, // tiny partitions -> guaranteed coalesce
      // A large "other" side so the plan actually shuffles (not a broadcast join, which has no
      // Exchange for coalesce/skew-split to target).
      query: { kind: 'join', joinType: 'inner', other: { rows: 50_000_000, bytesPerRow: 128 } },
    });
    const { stages, plan } = runQuery(cfg, 1, applyAqeRewrites);
    expect(plan.rewrites.length).toBeGreaterThan(0);
    for (const rewrite of plan.rewrites) {
      expect(rewrite.atMs).toBe(stages[0]?.finishMs);
      expect(rewrite.producingStageId).toBe(0);
    }
  });

  it('wall clock is not the sum of task durations when there are more slots than 1', () => {
    // Plenty of parallel slots relative to partitions -> tasks run mostly concurrently, so
    // stage wall clock must be far less than the sum of individual task durations.
    const cfg = config({ cluster: { executors: 8, coresPerExecutor: 4 }, sql: { shufflePartitions: 32 } });
    const { stages, tasks } = runQuery(cfg, 1, noopAqeHook);
    const sumOfStage0Durations = tasks
      .filter((t) => t.stageId === 0)
      .reduce((sum, t) => sum + (t.finishMs - t.launchMs), 0);
    const stage0WallClock = (stages[0]?.finishMs ?? 0) - (stages[0]?.launchMs ?? 0);
    expect(stage0WallClock).toBeLessThan(sumOfStage0Durations);
  });
});
