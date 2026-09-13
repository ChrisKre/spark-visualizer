'use client';

// SAS-052 (E6) — the module's own slice of ARCHITECTURE.md §3's data flow: knobs -> RunConfig
// -> RunResult. A fixed seed keeps a given knob combination's MODELED output deterministic
// across renders and reloads (SIMULATOR_SPEC.md's determinism guarantee only holds for a
// fixed seed; the UI has no reason to vary it).
//
// Calls `simulate()` directly rather than `@sas/fixtures`'s `resolveRun` — that resolver's
// fixture index is filesystem-backed (`readFileSync`/`node:fs`, see loader.ts's own header
// comment), which webpack can't put in a browser bundle at all, and its snapping index is
// empty today regardless (every committed fixture is `synthetic: true`, so it always falls
// through to `simulate()` — see resolve.ts). SAS-054 adds the real, fetch()-based browser
// equivalent per ARCHITECTURE.md §6 ("fixtures are fetched per module as static JSON, not
// bundled") and swaps it in here.
import { simulate, type RunResult } from '@sas/sim';
import { useEffect, useMemo } from 'react';
import { useAppActions, useKnobs } from '../../store/useAppStore';
import { buildRunConfig } from './buildRunConfig';

const SEED = 42;

export function useSkewRun(): RunResult {
  const knobs = useKnobs();
  const { setDuration } = useAppActions();

  const result = useMemo(() => simulate(buildRunConfig(knobs), SEED), [knobs]);

  // The clock's duration is a run's own wall clock — it moves whenever the knobs (and so the
  // run) change, which is also why compare mode (SAS-053) must pick one side's duration, not
  // try to average or sum both.
  useEffect(() => {
    setDuration(result.metrics.wallClockMs);
  }, [result, setDuration]);

  return result;
}
