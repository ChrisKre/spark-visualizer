'use client';

// SAS-052/053/054 (E6) — the module's own slice of ARCHITECTURE.md §3's data flow: knobs ->
// RunConfig -> snap-or-simulate -> RunResult. A fixed seed keeps a given knob combination's
// MODELED output deterministic across renders and reloads (SIMULATOR_SPEC.md's determinism
// guarantee only holds for a fixed seed; the UI has no reason to vary it).
//
// Uses `@sas/fixtures/snap`'s `snapOrSimulate` with a fetch()-built index (loadMeasuredFixtures)
// rather than `@sas/fixtures`'s `resolveRun` — that resolver's default index is filesystem-
// backed (`readFileSync`/`node:fs`, transitively via loader.ts), which webpack can't put in a
// browser bundle at all (confirmed by actually building it before this existed: it failed on
// node:path/node:url). The index starts empty and resolves asynchronously; every run is
// MODELED until it loads, then re-resolves against whatever non-synthetic fixtures exist —
// today that's none (SAS-023's sequencing note), so this has no visible effect until a real
// capture session lands, but the mechanism is real and tested end to end.
import { snapOrSimulate } from '@sas/fixtures/snap';
import type { ValidatedFixture } from '@sas/fixtures/schema';
import { asSimMs, type RunResult } from '@sas/sim';
import { useEffect, useMemo, useState } from 'react';
import { useAppActions, useCompare, useKnobs } from '../../store/useAppStore';
import { buildRunConfig } from './buildRunConfig';
import { loadMeasuredFixtures } from '../../fixtures/loadMeasuredFixtures';

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
  const [fixtures, setFixtures] = useState<ValidatedFixture[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadMeasuredFixtures().then((loaded) => {
      if (!cancelled) setFixtures(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const after = useMemo(() => snapOrSimulate(buildRunConfig(knobs), SEED, fixtures), [knobs, fixtures]);
  const before = useMemo(
    () => (compare ? snapOrSimulate(buildRunConfig({ ...knobs, salt: 1 }), SEED, fixtures) : undefined),
    [compare, knobs, fixtures],
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
