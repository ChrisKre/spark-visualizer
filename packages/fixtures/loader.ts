// SAS-022 — reads committed fixture JSON from packages/fixtures/data, validates it, and converts
// it into the same RunResult shape simulate() produces.
//
// Filesystem-backed (Node-only) — correct for Vitest, the MAE gate, and calibrate.py-adjacent
// tooling. Wiring a browser `fetch()` path into apps/web (docs/ARCHITECTURE.md §6: fixtures are
// fetched per module as static JSON, not bundled) is explicitly out of scope here — it belongs to
// whichever future ticket connects packages/fixtures into apps/web/store.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectWarnings, rollupMetrics } from '@sas/sim';
import type { RunResult, TaskResult } from '@sas/sim';
import { validateFixture, type ValidatedFixture } from './schema';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data');

/** Every committed fixture id (the JSON filename minus `.json`), sorted for determinism. */
export function listFixtureIds(): string[] {
  return readdirSync(DATA_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .sort();
}

/** Reads and validates one fixture by id. Throws if the file is missing or fails validation. */
export function loadFixture(id: string): ValidatedFixture {
  const raw = readFileSync(join(DATA_DIR, `${id}.json`), 'utf8');
  return validateFixture(JSON.parse(raw));
}

/**
 * Converts a validated fixture into a `RunResult`, strips the fixtures-only `rows` field (D2)
 * from each task, and rolls up metrics/warnings the same way `simulate()` does.
 *
 * `provenance: 'measured'` here reflects only that these values came from a committed fixture —
 * it says nothing about whether the fixture is a real capture or a synthetic stand-in. Keeping
 * the UI honest (never showing `MEASURED` for a synthetic fixture) is `resolve.ts`'s job: its
 * snapping index excludes every fixture with `synthetic: true`. Direct `loadFixture`/`toRunResult`
 * callers (tests, calibration tooling) are not wired to the UI and don't need that guarantee.
 */
export function toRunResult(fixture: ValidatedFixture): RunResult {
  const tasks: TaskResult[] = fixture.tasks.map(({ rows: _rows, ...task }) => task);
  const metrics = rollupMetrics(fixture.stages, tasks);
  const warnings = collectWarnings(fixture.stages, metrics);

  return {
    provenance: 'measured',
    fixtureId: fixture.id,
    stages: fixture.stages,
    tasks,
    plan: fixture.plan,
    metrics,
    warnings,
  };
}
