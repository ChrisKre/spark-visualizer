// SAS-022 — fixture snapping. See docs/SIMULATOR_SPEC.md §3: "resolveRun(config) checks the
// fixture index for a run whose config is within ε of the requested one... The badge in the UI is
// driven by this and nothing else. Never fake a `measured` badge."
//
// D3: the index built here only ever includes fixtures where `synthetic !== true`. Today every
// committed fixture is synthetic (see SAS-023/024), so the index is always empty and resolveRun
// always falls through to simulate() — the app continues to show MODELED everywhere, exactly the
// "valid, honest interim state" BACKLOG.md's sequencing note asks for. A real capture session
// (SAS-020/023/024 follow-up) populates the index for real by committing non-synthetic fixtures.
//
// This file (via loader.ts) is Node-only — apps/web's browser-side fixture fetcher (SAS-054)
// calls `snapOrSimulate` directly with its own fetch()-built index instead of importing this.
import type { RunConfig, RunResult } from '@sas/sim';
import { listFixtureIds, loadFixture } from './loader';
import type { ValidatedFixture } from './schema';
import { snapOrSimulate } from './snap';

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
 * Returns a fixture's recorded run if `config` snaps to one, else falls back to `simulate()`.
 * `fixtures` defaults to the real (non-synthetic) committed index — pass an explicit array in
 * tests to exercise snapping without touching the filesystem.
 */
export function resolveRun(config: RunConfig, seed: number, fixtures: ValidatedFixture[] = measuredFixtureIndex()): RunResult {
  return snapOrSimulate(config, seed, fixtures);
}
