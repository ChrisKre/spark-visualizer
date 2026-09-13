'use client';

// SAS-074 (E8) — URL serialisation of knobs + compare + clock position. Short keys, defaults
// omitted (BACKLOG.md): a knob only appears in the query string when it differs from the
// module's own defaults, `cmp` only when compare mode is on, `t` only once playback has moved
// (0 is the assumed starting point). `t` is stored as a fraction of duration, not an absolute
// simulated-ms value, so a permalink still lands at roughly the same *point in the story*
// even if a future change to the cost model shifts the run's total duration slightly.
import { asSimMs } from '@sas/sim';
import { useEffect, useRef } from 'react';
import { useAppActions, useAppStore } from './useAppStore';

const RESERVED_KEYS = new Set(['cmp', 't']);
const DEBOUNCE_MS = 250;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export interface DecodedUrlState {
  knobs: Record<string, number>;
  compare: boolean;
  /** Fraction of duration, [0, 1]. Callers apply this once a run's duration is known. */
  tFraction: number;
}

/** Pure — no window access — so it's trivially unit-testable and reusable for both the
 *  initial-load parse and any future "share this state" affordance. */
export function decodeParamsToState(params: URLSearchParams, defaultKnobs: Record<string, number>): DecodedUrlState {
  const knobs = { ...defaultKnobs };

  for (const [key, raw] of params.entries()) {
    if (RESERVED_KEYS.has(key)) continue;
    if (!(key in defaultKnobs)) {
      console.warn(`Permalink: unknown knob "${key}" — dropped.`);
      continue;
    }
    const value = Number(raw);
    if (Number.isFinite(value)) {
      knobs[key] = value;
    } else {
      console.warn(`Permalink: invalid value "${raw}" for knob "${key}" — dropped.`);
    }
  }

  const compare = params.get('cmp') === '1';
  const rawT = params.get('t');
  const tFraction = rawT !== null && Number.isFinite(Number(rawT)) ? clamp01(Number(rawT)) : 0;

  return { knobs, compare, tFraction };
}

export function encodeStateToParams(
  knobs: Record<string, number>,
  defaultKnobs: Record<string, number>,
  compare: boolean,
  tFraction: number,
): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(knobs)) {
    if (value !== defaultKnobs[key]) params.set(key, String(value));
  }
  if (compare) params.set('cmp', '1');
  if (tFraction > 0) params.set('t', clamp01(tFraction).toFixed(4));

  return params;
}

/**
 * Two-way binding between the URL query string and the store, scoped to one module's default
 * knobs. Reads once on mount (and whenever `defaultKnobs` changes identity, i.e. the module
 * changed); writes back via `history.replaceState` on a trailing debounce so dragging a
 * slider doesn't flood the history stack.
 */
export function useUrlSync(defaultKnobs: Record<string, number>): void {
  const { setKnobs, setCompare, setT } = useAppActions();
  const pendingTFraction = useRef<number | undefined>(undefined);
  const appliedInitial = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // URL -> store, once per module.
  useEffect(() => {
    appliedInitial.current = false;
    const params = new URLSearchParams(window.location.search);
    const decoded = decodeParamsToState(params, defaultKnobs);
    setKnobs(decoded.knobs);
    setCompare(decoded.compare);
    pendingTFraction.current = decoded.tFraction;
    appliedInitial.current = true;
    // setKnobs/setCompare are stable store actions (see useAppStore.ts) — defaultKnobs
    // identity is the only real signal here, marking a module switch.
  }, [defaultKnobs, setKnobs, setCompare]);

  // The parsed `t` fraction can only be applied once a run's duration is known — apply it the
  // first time duration becomes positive, then never again (subsequent duration changes, e.g.
  // a knob edit, must not keep snapping t back to the permalink's original position).
  useEffect(() => {
    return useAppStore.subscribe((state, prevState) => {
      if (
        pendingTFraction.current !== undefined &&
        state.clock.duration > 0 &&
        state.clock.duration !== prevState.clock.duration
      ) {
        setT(asSimMs(state.clock.duration * pendingTFraction.current));
        pendingTFraction.current = undefined;
      }
    });
  }, [setT]);

  // store -> URL, debounced.
  useEffect(() => {
    return useAppStore.subscribe((state) => {
      if (!appliedInitial.current) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const tFraction = state.clock.duration > 0 ? state.clock.t / state.clock.duration : 0;
        const params = encodeStateToParams(state.knobs, defaultKnobs, state.compare, tFraction);
        const query = params.toString();
        const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
        window.history.replaceState(null, '', url);
      }, DEBOUNCE_MS);
    });
  }, [defaultKnobs]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);
}
