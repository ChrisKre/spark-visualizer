/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { asSimMs } from '@sas/sim';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from './useAppStore';
import { useUrlSync } from './urlSync';

const DEFAULTS = { a: 0, salt: 1 };

function Harness({ defaultKnobs = DEFAULTS }: { defaultKnobs?: Record<string, number> }) {
  useUrlSync(defaultKnobs);
  return null;
}

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState(), true);
  window.history.replaceState(null, '', '/m/skew');
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useUrlSync', () => {
  it('applies knobs and compare from the URL on mount', () => {
    window.history.replaceState(null, '', '/m/skew?a=1.6&salt=8&cmp=1');
    render(<Harness />);
    expect(useAppStore.getState().knobs).toEqual({ a: 1.6, salt: 8 });
    expect(useAppStore.getState().compare).toBe(true);
  });

  it('defers applying t until duration is known, then applies it once', () => {
    window.history.replaceState(null, '', '/m/skew?t=0.5');
    render(<Harness />);
    expect(useAppStore.getState().clock.t).toBe(0);

    act(() => {
      useAppStore.getState().setDuration(asSimMs(10_000));
    });
    expect(useAppStore.getState().clock.t).toBe(5_000);

    // A later duration change (e.g. a knob edit) must not re-snap t to the permalink value.
    act(() => {
      useAppStore.getState().setT(asSimMs(1_000));
      useAppStore.getState().setDuration(asSimMs(20_000));
    });
    expect(useAppStore.getState().clock.t).toBe(1_000);
  });

  it('writes knob changes back to the URL after the debounce, omitting default-valued knobs', () => {
    render(<Harness />);

    act(() => {
      useAppStore.getState().setKnob('a', 1.6);
    });
    expect(window.location.search).toBe('');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(window.location.search).toBe('?a=1.6');
  });

  it('coalesces rapid changes into a single debounced write', () => {
    render(<Harness />);
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    act(() => {
      useAppStore.getState().setKnob('a', 1.0);
      vi.advanceTimersByTime(100);
      useAppStore.getState().setKnob('a', 1.6);
      vi.advanceTimersByTime(249);
    });
    expect(replaceStateSpy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?a=1.6');
  });
});
