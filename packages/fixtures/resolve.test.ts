// SAS-022 — resolve.ts tests. The key behavior (D3, docs/SIMULATOR_SPEC.md §3): resolveRun must
// never return provenance:'measured' unless a genuinely non-synthetic fixture matched.
import { describe, expect, it } from 'vitest';
import { DEFAULT_RUN_CONFIG } from '@sas/sim';
import type { RunConfig } from '@sas/sim';
import { resolveRun } from './resolve';
import { validateFixture, type ValidatedFixture } from './schema';

const scanNode = { id: 0, kind: 'Scan', children: [], stageId: 0 };

/** A fake fixture, injected directly rather than read from the filesystem, so this test never
 * needs a real non-synthetic capture to exist. */
function fakeMeasuredFixture(overrides: { id: string; zipfAlpha: number; saltFactor?: number }): ValidatedFixture {
  return validateFixture({
    id: overrides.id,
    schemaVersion: 1,
    captured: '2026-09-12',
    environment: { sparkVersion: '3.5.0', runtime: 'test', nodes: 1, nodeType: 'local-docker', executorMemoryMiB: 8192, coresPerExecutor: 4 },
    config: { zipfAlpha: overrides.zipfAlpha, saltFactor: overrides.saltFactor ?? 1, shufflePartitions: 200, aqe: false },
    synthetic: false,
    notes: 'fake, injected fixture for resolve.test.ts',
    sampling: { ratio: 1 },
    stages: [{ stageId: 0, planNodeId: 0, taskIds: [0], launchMs: 0, finishMs: 10, status: 'ok', partitionBytes: [1024] }],
    tasks: [
      {
        taskId: 0,
        stageId: 0,
        slot: 0,
        partitionId: 0,
        launchMs: 0,
        finishMs: 10,
        inputBytes: 1024,
        shuffleReadBytes: 0,
        shuffleWriteBytes: 1024,
        fetchWaitMs: 0,
        gcMs: 0,
        memorySpilledBytes: 0,
        diskSpilledBytes: 0,
        peakExecutionMemoryBytes: 2048,
        status: 'ok',
        rows: 8,
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
      data: { rows: 8, keyCardinality: 200, zipfAlpha: overrides.zipfAlpha, nullFraction: 0, bytesPerRow: 128, saltFactor: overrides.saltFactor ?? 1 },
      query: { kind: 'aggregate' },
    },
  });
}

function configWith(zipfAlpha: number, saltFactor = 1): RunConfig {
  return {
    ...DEFAULT_RUN_CONFIG,
    sql: { ...DEFAULT_RUN_CONFIG.sql, adaptive: { ...DEFAULT_RUN_CONFIG.sql.adaptive, enabled: false } },
    data: { ...DEFAULT_RUN_CONFIG.data, zipfAlpha, saltFactor },
  };
}

describe('resolveRun — with only synthetic fixtures (the real, filesystem-backed index)', () => {
  it('always falls through to simulate() and returns provenance: modeled', () => {
    const result = resolveRun(configWith(1.6), 1);
    expect(result.provenance).toBe('modeled');
    expect(result.fixtureId).toBeUndefined();
  });
});

describe('resolveRun — with an injected non-synthetic fixture', () => {
  const fixtures = [fakeMeasuredFixture({ id: 'fake_measured', zipfAlpha: 1.6 })];

  it('snaps within the M1 epsilon (0.05) and returns provenance: measured', () => {
    const result = resolveRun(configWith(1.62), 1, fixtures);
    expect(result.provenance).toBe('measured');
    expect(result.fixtureId).toBe('fake_measured');
  });

  it('does not snap when zipfAlpha is outside epsilon', () => {
    const result = resolveRun(configWith(1.2), 1, fixtures);
    expect(result.provenance).toBe('modeled');
    expect(result.fixtureId).toBeUndefined();
  });

  it('does not snap when saltFactor differs, even within the alpha epsilon', () => {
    const result = resolveRun(configWith(1.61, 8), 1, fixtures);
    expect(result.provenance).toBe('modeled');
  });
});
