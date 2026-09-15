/** @vitest-environment jsdom */
import { simulate } from '@sas/sim';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../store/useAppStore';
import { buildRunConfig } from './buildRunConfig';
import { useSkewRun } from './useSkewRun';
import { KNOB_DEFAULTS } from './knobs';

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
  useAppStore.getState().setKnobs(KNOB_DEFAULTS);
});

afterEach(() => {
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
});
