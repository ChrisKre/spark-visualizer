import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMeasuredFixtures, resetMeasuredFixturesCache } from './loadMeasuredFixtures';

const scanNode = { id: 0, kind: 'Scan', children: [], stageId: 0 };

function fakeFixtureJson(id: string, synthetic: boolean) {
  return {
    id,
    schemaVersion: 1,
    captured: '2026-09-12',
    environment: { sparkVersion: '3.5.0', runtime: 'test', nodes: 1, nodeType: 'local-docker', executorMemoryMiB: 8192, coresPerExecutor: 4 },
    config: { zipfAlpha: 1.6, saltFactor: 1, shufflePartitions: 200, aqe: false },
    synthetic,
    notes: 'fake fixture for loadMeasuredFixtures.test.ts',
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
      data: { rows: 8, keyCardinality: 200, zipfAlpha: 1.6, nullFraction: 0, bytesPerRow: 128, saltFactor: 1 },
      query: { kind: 'aggregate' },
    },
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

beforeEach(() => {
  resetMeasuredFixturesCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetMeasuredFixturesCache();
});

describe('loadMeasuredFixtures', () => {
  it('fetches the manifest then each fixture, excluding synthetic ones', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/fixtures/index.json') return jsonResponse(['real_one', 'synthetic_one']);
      if (url === '/fixtures/real_one.json') return jsonResponse(fakeFixtureJson('real_one', false));
      if (url === '/fixtures/synthetic_one.json') return jsonResponse(fakeFixtureJson('synthetic_one', true));
      return jsonResponse(undefined, false);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadMeasuredFixtures();
    expect(result.fixtures.map((f) => f.id)).toEqual(['real_one']);
    expect(result.fetchFailed).toBe(false);
  });

  it('caches the result — a second call does not refetch', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    await loadMeasuredFixtures();
    await loadMeasuredFixtures();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports fetchFailed, never throws, when the manifest fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(undefined, false)));
    await expect(loadMeasuredFixtures()).resolves.toEqual({ fixtures: [], fetchFailed: true });
  });

  it('reports fetchFailed, never throws, when fetch itself rejects (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await expect(loadMeasuredFixtures()).resolves.toEqual({ fixtures: [], fetchFailed: true });
  });

  it('does not report fetchFailed when the manifest loads fine but lists nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])));
    await expect(loadMeasuredFixtures()).resolves.toEqual({ fixtures: [], fetchFailed: false });
  });

  it('drops one fixture that fails to fetch without failing the whole index or reporting fetchFailed', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/fixtures/index.json') return jsonResponse(['ok_one', 'missing_one']);
      if (url === '/fixtures/ok_one.json') return jsonResponse(fakeFixtureJson('ok_one', false));
      return jsonResponse(undefined, false);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loadMeasuredFixtures();
    expect(result.fixtures.map((f) => f.id)).toEqual(['ok_one']);
    expect(result.fetchFailed).toBe(false);
  });
});
