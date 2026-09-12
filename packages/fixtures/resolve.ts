// SAS-022 — fixture snapping. See docs/SIMULATOR_SPEC.md §3: "resolveRun(config) checks the
// fixture index for a run whose config is within ε of the requested one... The badge in the UI is
// driven by this and nothing else. Never fake a `measured` badge."
//
// D3: the index built here only ever includes fixtures where `synthetic !== true`. Today every
// committed fixture is synthetic (see SAS-023/024), so the index is always empty and resolveRun
// always falls through to simulate() — the app continues to show MODELED everywhere, exactly the
// "valid, honest interim state" BACKLOG.md's sequencing note asks for. A real capture session
// (SAS-020/023/024 follow-up) populates the index for real by committing non-synthetic fixtures.
import { simulate } from '@sas/sim';
import type { RunConfig, RunResult } from '@sas/sim';
import { listFixtureIds, loadFixture, toRunResult } from './loader';
import type { ValidatedFixture } from './schema';

/** M1's declared epsilon (docs/SIMULATOR_SPEC.md §3). Every other knob below must match exactly. */
const ZIPF_ALPHA_EPSILON = 0.05;

let cachedIndex: ValidatedFixture[] | undefined;

/** Lazily loads every committed fixture and keeps only the non-synthetic ones. */
function measuredFixtureIndex(): ValidatedFixture[] {
  if (!cachedIndex) {
    cachedIndex = listFixtureIds()
      .map(loadFixture)
      .filter((fixture) => !fixture.synthetic);
  }
  return cachedIndex;
}

/**
 * Whether `requested` is within snapping distance of `fixture`. Expressed only in terms of the
 * documented `config` display block (zipfAlpha/saltFactor/shufflePartitions/aqe) — a known v1
 * limitation: M2's richer knobs (advisory size, skew factor, estimate error) aren't captured by
 * that block, so this match rule is exact-only for M1-shaped configs and coarse for M2 ones.
 * Widening `config` to carry module-specific knobs is a follow-up, not part of E3.
 */
function configMatches(requested: RunConfig, fixture: ValidatedFixture): boolean {
  const c = fixture.config;
  return (
    Math.abs(requested.data.zipfAlpha - c.zipfAlpha) <= ZIPF_ALPHA_EPSILON &&
    requested.data.saltFactor === c.saltFactor &&
    requested.sql.shufflePartitions === c.shufflePartitions &&
    requested.sql.adaptive.enabled === c.aqe
  );
}

/**
 * Returns a fixture's recorded run if `config` snaps to one, else falls back to `simulate()`.
 * `fixtures` defaults to the real (non-synthetic) committed index — pass an explicit array in
 * tests to exercise snapping without touching the filesystem.
 */
export function resolveRun(config: RunConfig, seed: number, fixtures: ValidatedFixture[] = measuredFixtureIndex()): RunResult {
  const match = fixtures.find((fixture) => configMatches(config, fixture));
  if (match) {
    return { ...toRunResult(match), fixtureId: match.id };
  }
  return simulate(config, seed);
}
