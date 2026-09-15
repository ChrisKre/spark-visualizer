// SAS-054 — snap.ts carries resolve.ts's actual snapping decision; resolve.test.ts already
// covers the epsilon rules end to end through resolveRun, so this only needs to prove
// snapOrSimulate itself has no filesystem dependency and behaves the same taking an explicit
// fixture list.
import { DEFAULT_RUN_CONFIG } from '@sas/sim';
import { describe, expect, it } from 'vitest';
import { validateFixture, type ValidatedFixture } from './schema';
import { snapOrSimulate } from './snap';

const scanNode = { id: 0, kind: 'Scan', children: [], stageId: 0 };

function fakeFixture(zipfAlpha: number): ValidatedFixture {
  return validateFixture({
    id: 'fake',
    schemaVersion: 1,
    captured: '2026-09-12',
    environment: { sparkVersion: '3.5.0', runtime: 'test', nodes: 1, nodeType: 'local-docker', executorMemoryMiB: 8192, coresPerExecutor: 4 },
    config: { zipfAlpha, saltFactor: 1, shufflePartitions: 200, aqe: false },
    synthetic: false,
    notes: 'fake, injected fixture for snap.test.ts',
    sampling: { ratio: 1 },
    stages: [{ stageId: 0, planNodeId: 0, taskIds: [0], launchMs: 0, finishMs: 10, status: 'ok', partitionBytes: [1024] }],
    tasks: [
      {
        taskId: 0, stageId: 0, slot: 0, partitionId: 0, launchMs: 0, finishMs: 10, inputBytes: 1024,
        shuffleReadBytes: 0, shuffleWriteBytes: 1024, fetchWaitMs: 0, gcMs: 0, memorySpilledBytes: 0,
        diskSpilledBytes: 0, peakExecutionMemoryBytes: 2048, status: 'ok', rows: 8,
      },
    ],
    plan: { initial: scanNode, final: scanNode, rewrites: [] },
    runConfig: {
      cluster: { executors: 8, coresPerExecutor: 4, executorMemoryMiB: 8192, memoryFraction: 0.6, storageFraction: 0.5 },
      sql: {
        shufflePartitions: 200,
        autoBroadcastJoinThresholdMiB: 10,
        adaptive: { enabled: false, advisoryPartitionSizeMiB: 64, coalescePartitions: true, skewJoinEnabled: true, skewedPartitionFactor: 5, skewedPartitionThresholdMiB: 256 },
      },
      data: { rows: 8, keyCardinality: 200, zipfAlpha, nullFraction: 0, bytesPerRow: 128, saltFactor: 1 },
      query: { kind: 'aggregate' },
    },
  });
}

function configWith(zipfAlpha: number): typeof DEFAULT_RUN_CONFIG {
  return {
    ...DEFAULT_RUN_CONFIG,
    sql: { ...DEFAULT_RUN_CONFIG.sql, adaptive: { ...DEFAULT_RUN_CONFIG.sql.adaptive, enabled: false } },
    data: { ...DEFAULT_RUN_CONFIG.data, zipfAlpha },
  };
}

describe('snapOrSimulate', () => {
  it('returns provenance: measured when a fixture in the given list snaps', () => {
    const result = snapOrSimulate(configWith(1.62), 1, [fakeFixture(1.6)]);
    expect(result.provenance).toBe('measured');
    expect(result.fixtureId).toBe('fake');
  });

  it('falls back to simulate() when nothing in the given list snaps', () => {
    const result = snapOrSimulate(configWith(0), 1, [fakeFixture(1.6)]);
    expect(result.provenance).toBe('modeled');
    expect(result.fixtureId).toBeUndefined();
  });

  it('falls back to simulate() for an empty fixture list', () => {
    const result = snapOrSimulate(configWith(1.6), 1, []);
    expect(result.provenance).toBe('modeled');
  });
});
