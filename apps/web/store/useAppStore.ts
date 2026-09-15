// SAS-071 (E8) — the one Zustand store apps/web owns (docs/ARCHITECTURE.md §2:
// `apps/web/store/ # Zustand store + URL serialisation`). Components never read the raw
// `useAppStore` hook directly outside this file — the selector hooks below are the
// "selector discipline" the ticket asks for: each subscribes to only the slice it needs, so
// a knob drag doesn't re-render the scrubber and a clock tick doesn't re-render the knob
// panel.
'use client';

import { asSimMs } from '@sas/sim';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { AppActions, AppStore, ClockState } from './types';

const INITIAL_CLOCK: ClockState = { t: asSimMs(0), playing: false, speed: 1, duration: asSimMs(0) };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export const useAppStore = create<AppStore>((set) => ({
  moduleId: '',
  knobs: {},
  compare: false,
  clock: INITIAL_CLOCK,

  setModule: (moduleId, defaultKnobs) =>
    set({ moduleId, knobs: defaultKnobs, compare: false, clock: INITIAL_CLOCK }),

  setKnob: (key, value) => set((state) => ({ knobs: { ...state.knobs, [key]: value } })),
  setKnobs: (knobs) => set({ knobs }),
  setCompare: (compare) => set({ compare }),

  play: () => set((state) => ({ clock: { ...state.clock, playing: true } })),
  pause: () => set((state) => ({ clock: { ...state.clock, playing: false } })),
  setSpeed: (speed) => set((state) => ({ clock: { ...state.clock, speed } })),

  setDuration: (duration) =>
    set((state) => ({
      clock: { ...state.clock, duration, t: asSimMs(clamp(state.clock.t, 0, duration)) },
    })),

  setT: (t) =>
    set((state) => ({ clock: { ...state.clock, t: asSimMs(clamp(t, 0, state.clock.duration)) } })),

  step: (deltaMs) =>
    set((state) => ({
      clock: { ...state.clock, t: asSimMs(clamp(state.clock.t + deltaMs, 0, state.clock.duration)) },
    })),
}));

export function useModuleId(): string {
  return useAppStore((state) => state.moduleId);
}

export function useKnobs(): Record<string, number> {
  return useAppStore(useShallow((state) => state.knobs));
}

export function useCompare(): boolean {
  return useAppStore((state) => state.compare);
}

export function useClock(): ClockState {
  return useAppStore(useShallow((state) => state.clock));
}

/** One selector for every action, so a component that needs several still takes a single,
 *  referentially-stable subscription rather than one hook call per action. */
export function useAppActions(): AppActions {
  return useAppStore(
    useShallow((state) => ({
      setModule: state.setModule,
      setKnob: state.setKnob,
      setKnobs: state.setKnobs,
      setCompare: state.setCompare,
      play: state.play,
      pause: state.pause,
      setSpeed: state.setSpeed,
      setDuration: state.setDuration,
      setT: state.setT,
      step: state.step,
    })),
  );
}
