import { describe, expect, it } from 'vitest';
import { asBytes, asSimMs } from '../types';
import type { StageResult, TaskResult } from '../types';
import { collectWarnings, rollupMetrics } from './metrics';

function task(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 0,
    stageId: 0,
    slot: 0,
    partitionId: 0,
    launchMs: asSimMs(0),
    finishMs: asSimMs(100),
    inputBytes: asBytes(1000),
    shuffleReadBytes: asBytes(0),
    shuffleWriteBytes: asBytes(1000),
    fetchWaitMs: asSimMs(0),
    gcMs: asSimMs(0),
    memorySpilledBytes: asBytes(0),
    diskSpilledBytes: asBytes(0),
    peakExecutionMemoryBytes: asBytes(1000),
    status: 'ok',
    ...overrides,
  };
}

function stage(overrides: Partial<StageResult> = {}): StageResult {
  return {
    stageId: 0,
    planNodeId: 0,
    taskIds: [0],
    launchMs: asSimMs(0),
    finishMs: asSimMs(100),
    status: 'ok',
    partitionBytes: [asBytes(1000)],
    ...overrides,
  };
}

describe('rollupMetrics', () => {
  it('cpuSeconds excludes fetchWaitMs', () => {
    const tasks = [task({ launchMs: asSimMs(0), finishMs: asSimMs(100), fetchWaitMs: asSimMs(40) })];
    const metrics = rollupMetrics([stage()], tasks);
    // 100ms total - 40ms fetch wait = 60ms of "real" work = 0.06 CPU-seconds.
    expect(metrics.cpuSeconds).toBeCloseTo(0.06, 6);
  });

  it('stragglerRatio is max(taskMs) / median(taskMs)', () => {
    const tasks = [
      task({ taskId: 0, launchMs: asSimMs(0), finishMs: asSimMs(100) }),
      task({ taskId: 1, launchMs: asSimMs(0), finishMs: asSimMs(100) }),
      task({ taskId: 2, launchMs: asSimMs(0), finishMs: asSimMs(1000) }),
    ];
    const metrics = rollupMetrics([stage()], tasks);
    expect(metrics.stragglerRatio).toBeCloseTo(10, 6);
  });

  it('wallClockMs spans stage launch/finish, not summed', () => {
    const stages = [stage({ launchMs: asSimMs(0), finishMs: asSimMs(100) }), stage({ stageId: 1, launchMs: asSimMs(100), finishMs: asSimMs(250) })];
    const metrics = rollupMetrics(stages, [task()]);
    expect(metrics.wallClockMs).toBe(250);
  });

  it('idleReducers counts zero-input tasks', () => {
    const tasks = [task({ inputBytes: asBytes(0) }), task({ taskId: 1, inputBytes: asBytes(500) })];
    const metrics = rollupMetrics([stage()], tasks);
    expect(metrics.idleReducers).toBe(1);
  });

  it('handles an empty run (no stages, no tasks) without dividing by zero', () => {
    const metrics = rollupMetrics([], []);
    expect(metrics.wallClockMs).toBe(0);
    expect(metrics.stragglerRatio).toBe(0);
    expect(Number.isFinite(metrics.gcPercent)).toBe(true);
  });

  it('median uses the average of the two middle values for an even-length task list', () => {
    const tasks = [
      task({ taskId: 0, launchMs: asSimMs(0), finishMs: asSimMs(100) }),
      task({ taskId: 1, launchMs: asSimMs(0), finishMs: asSimMs(200) }),
    ];
    const metrics = rollupMetrics([stage()], tasks);
    // median(100, 200) = 150; stragglerRatio = max(200) / median(150).
    expect(metrics.stragglerRatio).toBeCloseTo(200 / 150, 6);
  });
});

describe('collectWarnings', () => {
  it('emits an oom warning for a failed stage', () => {
    const warnings = collectWarnings([stage({ status: 'failed' })], rollupMetrics([stage({ status: 'failed' })], [task()]));
    expect(warnings.some((w) => w.code === 'oom')).toBe(true);
  });

  it('emits an idle-reducers warning when any partition is empty', () => {
    const tasks = [task({ inputBytes: asBytes(0) })];
    const metrics = rollupMetrics([stage()], tasks);
    const warnings = collectWarnings([stage()], metrics);
    expect(warnings.some((w) => w.code === 'idle-reducers')).toBe(true);
  });

  it('emits an excessive-gc warning when GC exceeds 10% of task time', () => {
    const tasks = [task({ launchMs: asSimMs(0), finishMs: asSimMs(100), gcMs: asSimMs(50) })];
    const metrics = rollupMetrics([stage()], tasks);
    const warnings = collectWarnings([stage()], metrics);
    expect(warnings.some((w) => w.code === 'excessive-gc')).toBe(true);
  });

  it('emits a high-spill warning when disk-spilled bytes exceed 20% of shuffle-write bytes', () => {
    const tasks = [task({ shuffleWriteBytes: asBytes(1000), diskSpilledBytes: asBytes(500) })];
    const metrics = rollupMetrics([stage()], tasks);
    const warnings = collectWarnings([stage()], metrics);
    expect(warnings.some((w) => w.code === 'high-spill')).toBe(true);
  });

  it('does not divide by zero when there is no shuffle-write at all', () => {
    const tasks = [task({ shuffleWriteBytes: asBytes(0), diskSpilledBytes: asBytes(0) })];
    const metrics = rollupMetrics([stage()], tasks);
    expect(() => collectWarnings([stage()], metrics)).not.toThrow();
  });

  it('emits no warnings for a healthy run', () => {
    const tasks = [task(), task({ taskId: 1 })];
    const metrics = rollupMetrics([stage()], tasks);
    const warnings = collectWarnings([stage()], metrics);
    expect(warnings).toEqual([]);
  });
});
