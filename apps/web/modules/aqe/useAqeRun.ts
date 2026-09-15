'use client';

// SAS-062 (E7) — the module's own slice of ARCHITECTURE.md §3's data flow: knobs ->
// RunConfig -> snap-or-simulate -> RunResult. Mirrors skew/useSkewRun.ts's shape exactly;
// "before" forces `aqe: 0` (a frozen, un-rewritten plan) instead of M1's `salt: 1`.
import { snapOrSimulate } from '@sas/fixtures/snap';
import type { ValidatedFixture } from '@sas/fixtures/schema';
import { asSimMs, type RunResult } from '@sas/sim';
import { useEffect, useMemo, useState } from 'react';
import { useAppActions, useCompare, useKnobs } from '../../store/useAppStore';
import { buildRunConfig } from './buildRunConfig';
import { loadMeasuredFixtures } from '../../fixtures/loadMeasuredFixtures';

const SEED = 42;

export interface AqeRuns {
  /** The run for the knobs exactly as configured — always computed. */
  after: RunResult;
  /**
   * The same knobs with `aqe` forced to 0 — AQE off, regardless of whatever the aqe knob is
   * currently set to. Only computed in compare mode, since it's a second simulate() call
   * nothing else needs. Its plan never rewrites (packages/sim/model/run.ts never calls the AQE
   * hook when sql.adaptive.enabled is false), so `before.plan.initial === before.plan.final`.
   */
  before?: RunResult;
  /**
   * SAS-076 (E8) — true when the measured-fixture manifest fetch genuinely failed, as opposed
   * to loading fine and simply finding no non-synthetic fixtures (today's ordinary state). See
   * skew/useSkewRun.ts's identical field for the full rationale.
   */
  fixturesUnavailable: boolean;
}

export function useAqeRun(): AqeRuns {
  const knobs = useKnobs();
  const compare = useCompare();
  const { setDuration } = useAppActions();
  const [fixtures, setFixtures] = useState<ValidatedFixture[]>([]);
  const [fixturesUnavailable, setFixturesUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMeasuredFixtures().then((result) => {
      if (cancelled) return;
      setFixtures(result.fixtures);
      setFixturesUnavailable(result.fetchFailed);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const after = useMemo(() => snapOrSimulate(buildRunConfig(knobs), SEED, fixtures), [knobs, fixtures]);
  const before = useMemo(
    () => (compare ? snapOrSimulate(buildRunConfig({ ...knobs, aqe: 0 }), SEED, fixtures) : undefined),
    [compare, knobs, fixtures],
  );

  // Same rule as useSkewRun.ts: the clock's duration is a run's own wall clock, and in compare
  // mode it's the longer of the two sides so both timelines/plan trees can play to completion
  // on the one shared clock rather than one of them getting cut off.
  useEffect(() => {
    const duration = before ? Math.max(before.metrics.wallClockMs, after.metrics.wallClockMs) : after.metrics.wallClockMs;
    setDuration(asSimMs(duration));
  }, [before, after, setDuration]);

  return { after, before, fixturesUnavailable };
}
