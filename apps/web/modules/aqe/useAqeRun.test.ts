/** @vitest-environment jsdom */
import { simulate } from '@sas/sim';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { resetMeasuredFixturesCache } from '../../fixtures/loadMeasuredFixtures';
import { buildRunConfig } from './buildRunConfig';
import { useAqeRun } from './useAqeRun';
import { KNOB_DEFAULTS } from './knobs';

// No committed M2 fixture is non-synthetic yet (every packages/fixtures/data/m2_*.json is
// synthetic), so an always-404 fetch is the deterministic stand-in for "no fixture fetch has
// resolved yet" — see apps/web/fixtures/loadMeasuredFixtures.ts.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as Response));
  resetMeasuredFixturesCache();
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.getState().setKnobs(KNOB_DEFAULTS);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetMeasuredFixturesCache();
  useAppStore.setState(useAppStore.getInitialState(), true);
});

describe('useAqeRun', () => {
  it('returns a modeled "after" run for the current knobs, and no "before" outside compare mode', () => {
    const { result } = renderHook(() => useAqeRun());
    expect(result.current.after.provenance).toBe('modeled');
    expect(result.current.after.stages.length).toBeGreaterThan(0);
    expect(result.current.before).toBeUndefined();
  });

  it('sets the store\'s clock duration to the run\'s wall clock outside compare mode', () => {
    const expected = simulate(buildRunConfig(KNOB_DEFAULTS), 42).metrics.wallClockMs;
    renderHook(() => useAqeRun());
    expect(useAppStore.getState().clock.duration).toBe(expected);
  });

  it('recomputes when a knob changes', () => {
    const { result, rerender } = renderHook(() => useAqeRun());
    expect(result.current.after.plan.rewrites.map((r) => r.rule)).toEqual(['coalesceShufflePartitions']);

    act(() => {
      useAppStore.getState().setKnob('skf', 2);
    });
    rerender();

    expect(result.current.after.plan.rewrites.map((r) => r.rule)).toEqual([
      'optimizeSkewedJoin',
      'coalesceShufflePartitions',
    ]);
  });

  describe('compare mode', () => {
    beforeEach(() => {
      useAppStore.getState().setCompare(true);
    });

    it('computes a "before" run with aqe forced to 0, regardless of the aqe knob', () => {
      const { result } = renderHook(() => useAqeRun());
      expect(result.current.before).toBeDefined();
      const expectedBefore = simulate(buildRunConfig({ ...KNOB_DEFAULTS, aqe: 0 }), 42).metrics;
      expect(result.current.before?.metrics).toEqual(expectedBefore);
    });

    it('the "before" plan never rewrites — initial and final are the same tree', () => {
      const { result } = renderHook(() => useAqeRun());
      expect(result.current.before?.plan.rewrites).toEqual([]);
      expect(result.current.before?.plan.initial).toEqual(result.current.before?.plan.final);
    });

    it('sets duration to the longer of before/after, not their sum or average', () => {
      const { result } = renderHook(() => useAqeRun());
      const expectedDuration = Math.max(
        result.current.before?.metrics.wallClockMs ?? 0,
        result.current.after.metrics.wallClockMs,
      );
      expect(useAppStore.getState().clock.duration).toBe(expectedDuration);
    });
  });

  describe('fixture snapping', () => {
    it('flips provenance to measured once a matching non-synthetic fixture has been fetched', async () => {
      const scanNode = { id: 0, kind: 'Scan', children: [], stageId: 0 };
      const fakeFixtureJson = {
        id: 'fake_measured_aqe',
        schemaVersion: 1,
        captured: '2026-09-12',
        environment: { sparkVersion: '3.5.0', runtime: 'test', nodes: 1, nodeType: 'local-docker', executorMemoryMiB: 8192, coresPerExecutor: 4 },
        config: { zipfAlpha: 0, saltFactor: 1, shufflePartitions: 200, aqe: true },
        synthetic: false,
        notes: 'fake, injected fixture for useAqeRun.test.ts',
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
            adaptive: { enabled: true, advisoryPartitionSizeMiB: 64, coalescePartitions: true, skewJoinEnabled: true, skewedPartitionFactor: 5, skewedPartitionThresholdMiB: 64 },
          },
          data: { rows: 8, keyCardinality: 200, zipfAlpha: 0, nullFraction: 0, bytesPerRow: 128, saltFactor: 1 },
          query: { kind: 'aggregate' },
        },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url === '/fixtures/index.json') return { ok: true, json: async () => ['fake_measured_aqe'] } as Response;
          if (url === '/fixtures/fake_measured_aqe.json') return { ok: true, json: async () => fakeFixtureJson } as Response;
          return { ok: false } as Response;
        }),
      );

      const { result } = renderHook(() => useAqeRun());
      expect(result.current.after.provenance).toBe('modeled');

      await waitFor(() => expect(result.current.after.provenance).toBe('measured'));
      expect(result.current.after.fixtureId).toBe('fake_measured_aqe');
    });
  });

  describe('fixturesUnavailable (SAS-076)', () => {
    it('is false while the manifest fetch is still pending, and stays false once it resolves fine', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as Response));
      const { result } = renderHook(() => useAqeRun());
      expect(result.current.fixturesUnavailable).toBe(false);
      await waitFor(() => expect(result.current.after).toBeDefined());
      expect(result.current.fixturesUnavailable).toBe(false);
    });

    it('flips true once a genuinely failed manifest fetch resolves', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as Response));
      const { result } = renderHook(() => useAqeRun());
      await waitFor(() => expect(result.current.fixturesUnavailable).toBe(true));
    });
  });
});
