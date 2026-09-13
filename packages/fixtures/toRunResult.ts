// Split out of loader.ts (SAS-054) so it can be imported without pulling in loader.ts's
// `node:fs`/`node:path`/`node:url` imports — those make loader.ts (and the `@sas/fixtures`
// barrel that re-exports it) unbundlable for a browser target. This file has no such
// dependency, so apps/web's browser-side fixture fetcher (SAS-054) can import it directly via
// the `@sas/fixtures/toRunResult` subpath while still using the committed-JSON-reading path
// (loader.ts, Vitest, calibrate.py-adjacent tooling) everywhere else.
import { collectWarnings, rollupMetrics } from '@sas/sim';
import type { RunResult, TaskResult } from '@sas/sim';
import type { ValidatedFixture } from './schema';

/**
 * Converts a validated fixture into a `RunResult`, strips the fixtures-only `rows` field (D2)
 * from each task, and rolls up metrics/warnings the same way `simulate()` does.
 *
 * `provenance: 'measured'` here reflects only that these values came from a committed fixture —
 * it says nothing about whether the fixture is a real capture or a synthetic stand-in. Keeping
 * the UI honest (never showing `MEASURED` for a synthetic fixture) is the caller's job: both
 * `resolve.ts` and apps/web's browser-side equivalent exclude `synthetic: true` fixtures from
 * their snapping index. Direct `toRunResult` callers (tests, calibration tooling) are not wired
 * to the UI and don't need that guarantee.
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
