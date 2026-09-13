import type { RunResult, StageResult } from '@sas/sim';
import { asBytes, asSimMs } from '@sas/sim';
import { describe, expect, it } from 'vitest';
import { pickHistogramStage } from './histogramStage';

function stage(overrides: { stageId: number; partitionBytes: number[] }): StageResult {
  return {
    stageId: overrides.stageId,
    planNodeId: 0,
    taskIds: [],
    launchMs: asSimMs(0),
    finishMs: asSimMs(0),
    status: 'ok',
    partitionBytes: overrides.partitionBytes.map(asBytes),
  };
}

function result(stages: StageResult[]): RunResult {
  return {
    provenance: 'modeled',
    stages,
    tasks: [],
    plan: { initial: { id: 0, kind: 'Scan', children: [], stageId: 0 }, final: { id: 0, kind: 'Scan', children: [], stageId: 0 }, rewrites: [] },
    metrics: {
      wallClockMs: asSimMs(0),
      cpuSeconds: 0,
      stragglerRatio: 1,
      shuffleReadBytes: asBytes(0),
      shuffleWriteBytes: asBytes(0),
      diskSpilledBytes: asBytes(0),
      memorySpilledBytes: asBytes(0),
      gcMs: asSimMs(0),
      gcPercent: 0,
      idleReducers: 0,
    },
    warnings: [],
  };
}

describe('pickHistogramStage', () => {
  it('picks the stage whose partitionBytes length matches shufflePartitions', () => {
    const wanted = stage({ stageId: 1, partitionBytes: [10, 20, 30] });
    const other = stage({ stageId: 0, partitionBytes: [1, 2] });
    expect(pickHistogramStage(result([other, wanted]), 3)).toBe(wanted);
  });

  it('breaks ties between equally-sized stages by picking the one with the larger max', () => {
    const bigger = stage({ stageId: 1, partitionBytes: [10, 900] });
    const smaller = stage({ stageId: 2, partitionBytes: [10, 20] });
    expect(pickHistogramStage(result([smaller, bigger]), 2)).toBe(bigger);
  });

  it('falls back to the first stage when nothing matches', () => {
    const only = stage({ stageId: 0, partitionBytes: [1, 2] });
    expect(pickHistogramStage(result([only]), 200)).toBe(only);
  });

  it('returns undefined for a run with no stages at all', () => {
    expect(pickHistogramStage(result([]), 200)).toBeUndefined();
  });
});
