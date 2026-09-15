/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { asSimMs } from '@sas/sim';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockDriver } from './ClockDriver';
import { useAppStore } from './useAppStore';

let reducedMotion = false;
vi.mock('@sas/ui', () => ({
  usePrefersReducedMotion: () => reducedMotion,
}));

function mockRaf() {
  let pending: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    pending = cb;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
    pending = undefined;
  });
  return {
    /** Invokes whichever rAF callback is currently scheduled, if any. */
    flush(now: number) {
      const cb = pending;
      pending = undefined;
      cb?.(now);
    },
  };
}

beforeEach(() => {
  reducedMotion = false;
  useAppStore.setState(useAppStore.getInitialState(), true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ClockDriver', () => {
  it('does not advance t while paused', () => {
    const raf = mockRaf();
    useAppStore.getState().setDuration(asSimMs(12_000));
    render(<ClockDriver />);

    raf.flush(0);
    raf.flush(1000);
    expect(useAppStore.getState().clock.t).toBe(0);
  });

  it('advances t at speed=1 so a 12s-target run finishes in ~TARGET_PLAYBACK_MS of real time', () => {
    const raf = mockRaf();
    useAppStore.getState().setDuration(asSimMs(12_000));
    useAppStore.getState().play();
    render(<ClockDriver />);

    raf.flush(0); // establishes the first frame timestamp, advances nothing yet
    raf.flush(1000); // +1000 real ms at speed 1 (duration 12_000 / TARGET 12_000) => +1000 sim ms
    expect(useAppStore.getState().clock.t).toBe(1000);
  });

  it('clamps at duration and pauses automatically', () => {
    const raf = mockRaf();
    useAppStore.getState().setDuration(asSimMs(1_000));
    useAppStore.getState().play();
    render(<ClockDriver />);

    raf.flush(0);
    raf.flush(20_000); // wildly overshoots duration
    expect(useAppStore.getState().clock.t).toBe(1_000);
    expect(useAppStore.getState().clock.playing).toBe(false);
  });

  it('under prefers-reduced-motion, jumps to the final frame and never advances', () => {
    reducedMotion = true;
    const raf = mockRaf();
    useAppStore.getState().setDuration(asSimMs(5_000));
    useAppStore.getState().play();
    render(<ClockDriver />);

    expect(useAppStore.getState().clock.t).toBe(5_000);
    raf.flush(0);
    raf.flush(1000);
    expect(useAppStore.getState().clock.t).toBe(5_000);
  });
});
