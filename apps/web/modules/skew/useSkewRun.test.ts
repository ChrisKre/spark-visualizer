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
  it('returns a modeled RunResult for the current knobs', () => {
    const { result } = renderHook(() => useSkewRun());
    expect(result.current.provenance).toBe('modeled');
    expect(result.current.stages.length).toBeGreaterThan(0);
    expect(result.current.tasks.length).toBeGreaterThan(0);
  });

  it('sets the store\'s clock duration to the run\'s wall clock', () => {
    const expected = simulate(buildRunConfig(KNOB_DEFAULTS), 42).metrics.wallClockMs;
    renderHook(() => useSkewRun());
    expect(useAppStore.getState().clock.duration).toBe(expected);
  });

  it('recomputes when a knob changes, and the new duration follows it', () => {
    const { result, rerender } = renderHook(() => useSkewRun());
    const before = result.current.metrics.wallClockMs;

    act(() => {
      useAppStore.getState().setKnob('salt', 8);
    });
    rerender();

    expect(result.current.metrics.wallClockMs).not.toBe(before);
    expect(useAppStore.getState().clock.duration).toBe(result.current.metrics.wallClockMs);
  });

  it('is deterministic for the same knobs', () => {
    const a = renderHook(() => useSkewRun()).result.current;
    const b = renderHook(() => useSkewRun()).result.current;
    expect(a.metrics).toEqual(b.metrics);
  });
});
