'use client';

// SAS-052/053 (E6) — the module's own slice of ARCHITECTURE.md §3's data flow: knobs ->
// RunConfig -> RunResult. A fixed seed keeps a given knob combination's MODELED output
// deterministic across renders and reloads (SIMULATOR_SPEC.md's determinism guarantee only
// holds for a fixed seed; the UI has no reason to vary it).
//
// Calls `simulate()` directly rather than `@sas/fixtures`'s `resolveRun` — that resolver's
// fixture index is filesystem-backed (`readFileSync`/`node:fs`, see loader.ts's own header
// comment), which webpack can't put in a browser bundle at all, and its snapping index is
// empty today regardless (every committed fixture is `synthetic: true`, so it always falls
// through to `simulate()` — see resolve.ts). SAS-054 adds the real, fetch()-based browser
// equivalent per ARCHITECTURE.md §6 ("fixtures are fetched per module as static JSON, not
// bundled") and swaps it in here.
import { asSimMs, simulate, type RunResult } from '@sas/sim';
import { useEffect, useMemo } from 'react';
import { useAppActions, useCompare, useKnobs } from '../../store/useAppStore';
import { buildRunConfig } from './buildRunConfig';

const SEED = 42;

export interface SkewRuns {
  /** The run for the knobs exactly as configured — always computed. */
  after: RunResult;
  /**
   * The same knobs with `salt` forced to 1 — the "hero before" (docs/modules/m1-skew.md §2),
   * regardless of whatever the salt knob is currently set to. Only computed in compare mode,
   * since it's a second simulate() call nothing else needs.
   */
  before?: RunResult;
}

export function useSkewRun(): SkewRuns {
  const knobs = useKnobs();
  const compare = useCompare();
  const { setDuration } = useAppActions();

  const after = useMemo(() => simulate(buildRunConfig(knobs), SEED), [knobs]);
  const before = useMemo(
    () => (compare ? simulate(buildRunConfig({ ...knobs, salt: 1 }), SEED) : undefined),
    [compare, knobs],
  );

  // The clock's duration is a run's own wall clock. In compare mode it's the longer of the
  // two sides, so both timelines can play to completion on the one shared clock rather than
  // one of them getting cut off — never an average or a sum of the two.
  useEffect(() => {
    const duration = before ? Math.max(before.metrics.wallClockMs, after.metrics.wallClockMs) : after.metrics.wallClockMs;
    setDuration(asSimMs(duration));
  }, [before, after, setDuration]);

  return { after, before };
}
