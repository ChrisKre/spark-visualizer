'use client';

// SAS-072 (E8) — the one requestAnimationFrame loop, per docs/ARCHITECTURE.md §4: "A single
// requestAnimationFrame loop in one <ClockDriver> component advances t; components subscribe
// to t and derive their own frame." Nothing else in apps/web or packages/viz may call rAF —
// packages/viz/canvas's TaskTimeline is already a controlled component that only paints the
// `currentMs` it's given (see its own header comment).
//
// `speed` (store-level, user-facing) is a playback-rate multiplier, not a raw SimMs-per-
// RenderMs ratio: at speed=1 any run's `duration` is stretched or compressed to play in
// TARGET_PLAYBACK_MS of real time, matching "a six-minute stage plays in about 12 s at
// default speed" for six minutes *and* for every other duration a run might produce.
import { asRenderMs, asSimMs } from '@sas/sim';
import { usePrefersReducedMotion } from '@sas/ui';
import { useEffect, useRef } from 'react';
import { useAppActions, useAppStore, useClock } from './useAppStore';

const TARGET_PLAYBACK_MS = 12_000;

export function ClockDriver(): null {
  const { playing, speed, duration } = useClock();
  const { setT, pause } = useAppActions();
  const prefersReducedMotion = usePrefersReducedMotion();
  const lastFrameRenderMs = useRef<number | undefined>(undefined);

  // ARCHITECTURE.md §4: "the driver does not advance, and the UI shows the final frame plus
  // a step control" — reduced motion is handled here, and only here.
  useEffect(() => {
    if (prefersReducedMotion) setT(duration);
  }, [prefersReducedMotion, duration, setT]);

  useEffect(() => {
    if (!playing || prefersReducedMotion || duration <= 0) {
      lastFrameRenderMs.current = undefined;
      return undefined;
    }

    let frameId: number;

    function tick(now: number): void {
      const last = lastFrameRenderMs.current;
      lastFrameRenderMs.current = now;
      if (last !== undefined) {
        const deltaRenderMs = asRenderMs(now - last);
        const simMsPerRenderMs = (duration / TARGET_PLAYBACK_MS) * speed;
        const nextT = useAppStore.getState().clock.t + deltaRenderMs * simMsPerRenderMs;
        if (nextT >= duration) {
          setT(asSimMs(duration));
          pause();
          return;
        }
        setT(asSimMs(nextT));
      }
      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      lastFrameRenderMs.current = undefined;
    };
  }, [playing, prefersReducedMotion, duration, speed, setT, pause]);

  return null;
}
