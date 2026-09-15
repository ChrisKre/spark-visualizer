/** @vitest-environment jsdom */
import { simulate } from '@sas/sim';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { resetMeasuredFixturesCache } from '../../fixtures/loadMeasuredFixtures';
import { buildRunConfig } from './buildRunConfig';
import { useSkewRun } from './useSkewRun';
import { KNOB_DEFAULTS } from './knobs';

// The default knobs never match a committed fixture (none are non-synthetic yet — see
// buildRunConfig.ts/useSkewRun.ts), so an empty fixture index is the deterministic, explicit
// stand-in for "no fixture fetch has resolved yet" throughout this file.
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

describe('useSkewRun', () => {
  it('returns a modeled "after" run for the current knobs, and no "before" outside compare mode', () => {
    const { result } = renderHook(() => useSkewRun());
    expect(result.current.after.provenance).toBe('modeled');
    expect(result.current.after.stages.length).toBeGreaterThan(0);
    expect(result.current.before).toBeUndefined();
  });

  it('sets the store\'s clock duration to the run\'s wall clock outside compare mode', () => {
    const expected = simulate(buildRunConfig(KNOB_DEFAULTS), 42).metrics.wallClockMs;
    renderHook(() => useSkewRun());
    expect(useAppStore.getState().clock.duration).toBe(expected);
  });

  it('recomputes when a knob changes, and the new duration follows it', () => {
    const { result, rerender } = renderHook(() => useSkewRun());
    const before = result.current.after.metrics.wallClockMs;

    act(() => {
      useAppStore.getState().setKnob('salt', 8);
    });
    rerender();

    expect(result.current.after.metrics.wallClockMs).not.toBe(before);
    expect(useAppStore.getState().clock.duration).toBe(result.current.after.metrics.wallClockMs);
  });

  it('is deterministic for the same knobs', () => {
    const a = renderHook(() => useSkewRun()).result.current.after;
    const b = renderHook(() => useSkewRun()).result.current.after;
    expect(a.metrics).toEqual(b.metrics);
  });

  describe('compare mode', () => {
    beforeEach(() => {
      useAppStore.getState().setCompare(true);
    });

    it('computes a "before" run with salt forced to 1, regardless of the salt knob', () => {
      useAppStore.getState().setKnob('salt', 8);
      const { result } = renderHook(() => useSkewRun());
      expect(result.current.before).toBeDefined();
      const expectedBefore = simulate(buildRunConfig({ ...KNOB_DEFAULTS, salt: 1 }), 42).metrics;
      expect(result.current.before?.metrics).toEqual(expectedBefore);
    });

    it('sets duration to the longer of before/after, not their sum or average', () => {
      useAppStore.getState().setKnob('salt', 8);
      const { result } = renderHook(() => useSkewRun());
      const expectedDuration = Math.max(
        result.current.before?.metrics.wallClockMs ?? 0,
        result.current.after.metrics.wallClockMs,
      );
      expect(useAppStore.getState().clock.duration).toBe(expectedDuration);
      // Sanity: the unsalted "before" really is the slower one here, so this test would
      // catch a regression to "always after's duration" as well as to "sum"/"average".
      expect(expectedDuration).toBe(result.current.before?.metrics.wallClockMs);
    });
  });

  describe('fixture snapping (SAS-054)', () => {
    const scanNode = { id: 0, kind: 'Scan', children: [], stageId: 0 };

    /** A non-synthetic fixture whose `config` block snaps to KNOB_DEFAULTS exactly. */
    function fakeMeasuredFixtureJson() {
      return {
        id: 'fake_measured_default',
        schemaVersion: 1,
        captured: '2026-09-12',
        environment: { sparkVersion: '3.5.0', runtime: 'test', nodes: 1, nodeType: 'local-docker', executorMemoryMiB: 8192, coresPerExecutor: 4 },
        config: { zipfAlpha: KNOB_DEFAULTS.a, saltFactor: KNOB_DEFAULTS.salt, shufflePartitions: KNOB_DEFAULTS.sp, aqe: true },
        synthetic: false,
        notes: 'fake, injected fixture for useSkewRun.test.ts',
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
          cluster: { executors: KNOB_DEFAULTS.ex, coresPerExecutor: 4, executorMemoryMiB: 8192, memoryFraction: 0.6, storageFraction: 0.5 },
          sql: {
            shufflePartitions: KNOB_DEFAULTS.sp,
            autoBroadcastJoinThresholdMiB: 10,
            adaptive: { enabled: true, advisoryPartitionSizeMiB: 64, coalescePartitions: true, skewJoinEnabled: true, skewedPartitionFactor: 5, skewedPartitionThresholdMiB: 256 },
          },
          data: { rows: 8, keyCardinality: 200, zipfAlpha: KNOB_DEFAULTS.a, nullFraction: 0, bytesPerRow: 128, saltFactor: KNOB_DEFAULTS.salt },
          query: { kind: 'aggregate' },
        },
      };
    }

    it('flips provenance to measured once a matching non-synthetic fixture has been fetched', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url === '/fixtures/index.json') return { ok: true, json: async () => ['fake_measured_default'] } as Response;
          if (url === '/fixtures/fake_measured_default.json') return { ok: true, json: async () => fakeMeasuredFixtureJson() } as Response;
          return { ok: false } as Response;
        }),
      );

      const { result } = renderHook(() => useSkewRun());
      expect(result.current.after.provenance).toBe('modeled'); // before the fetch resolves

      await waitFor(() => expect(result.current.after.provenance).toBe('measured'));
      expect(result.current.after.fixtureId).toBe('fake_measured_default');

      // Salting away from the fixture's exact saltFactor must fall back to modeled again —
      // the badge can never lie in either direction.
      act(() => {
        useAppStore.getState().setKnob('salt', 8);
      });
      expect(result.current.after.provenance).toBe('modeled');
    });
  });
});
