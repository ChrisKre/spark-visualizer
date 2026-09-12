import { describe, expect, it } from 'vitest';
import { asBytes, asSimMs } from '../types';
import type { TaskCost } from './cost';
import { scheduleStage } from './scheduler';

function cost(overrides: Partial<TaskCost> = {}): TaskCost {
  return {
    baseMs: asSimMs(100),
    inputBytes: asBytes(1000),
    shuffleReadBytes: asBytes(0),
    shuffleWriteBytes: asBytes(1000),
    gcMs: asSimMs(0),
    memorySpilledBytes: asBytes(0),
    diskSpilledBytes: asBytes(0),
    peakExecutionMemoryBytes: asBytes(1000),
    status: 'ok',
    ...overrides,
  };
}

describe('scheduleStage', () => {
  it('stage wall clock is max(finish) - min(launch), NOT the sum of task durations', () => {
    // 4 tasks of 100ms each, only 1 slot: sum = 400ms, but with 1 slot they queue back-to-back,
    // so max(finish)-min(launch) also happens to equal 400ms here — use 2 slots instead so the
    // two numbers genuinely diverge.
    const costs = [cost(), cost(), cost(), cost()];
    const { stage } = scheduleStage(costs, 0, 0, asSimMs(0), 2, 1000);
    const sumOfDurations = costs.length * 100;
    const wallClock = stage.finishMs - stage.launchMs;
    expect(wallClock).toBeLessThan(sumOfDurations);
    expect(wallClock).toBe(200); // 4 tasks / 2 slots, 100ms each -> 2 rounds
  });

  it('never overlaps two tasks in the same slot', () => {
    const costs = [cost(), cost(), cost()];
    const { tasks } = scheduleStage(costs, 0, 0, asSimMs(0), 1, 1000);
    for (let i = 1; i < tasks.length; i++) {
      const prev = tasks[i - 1];
      const cur = tasks[i];
      expect(prev).toBeDefined();
      expect(cur).toBeDefined();
      if (prev && cur && prev.slot === cur.slot) {
        expect(cur.launchMs).toBeGreaterThanOrEqual(prev.finishMs);
      }
    }
  });

  it('fetchWaitMs grows when more reducers fetch concurrently over the same bandwidth', () => {
    const shuffleReadCost = cost({ shuffleReadBytes: asBytes(100 * 1024 * 1024), shuffleWriteBytes: asBytes(0) });
    // Many slots so all tasks launch at t=0 and genuinely contend for bandwidth.
    const manyConcurrent = scheduleStage(
      Array.from({ length: 8 }, () => shuffleReadCost),
      1,
      0,
      asSimMs(0),
      8,
      100
    );
    const oneAtATime = scheduleStage([shuffleReadCost], 1, 0, asSimMs(0), 8, 100);

    // The first task to launch never sees contention (nothing else has started fetching yet);
    // the last of 8 tasks launching at the same simulated time sees the other 7 already
    // fetching, so it is the one that should show the bandwidth-sharing penalty.
    const lastConcurrentFetchWait = manyConcurrent.tasks[manyConcurrent.tasks.length - 1]?.fetchWaitMs ?? 0;
    const soloFetchWait = oneAtATime.tasks[0]?.fetchWaitMs ?? 0;
    expect(lastConcurrentFetchWait).toBeGreaterThan(soloFetchWait);
  });

  it('marks the stage failed iff any task is oom', () => {
    const ok = scheduleStage([cost(), cost()], 0, 0, asSimMs(0), 2, 1000);
    expect(ok.stage.status).toBe('ok');

    const withOom = scheduleStage([cost(), cost({ status: 'oom' })], 0, 0, asSimMs(0), 2, 1000);
    expect(withOom.stage.status).toBe('failed');
  });
});
