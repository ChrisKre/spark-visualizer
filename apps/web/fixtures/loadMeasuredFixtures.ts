// SAS-054 (E6) — the browser-side equivalent of packages/fixtures/resolve.ts's
// measuredFixtureIndex(), per ARCHITECTURE.md §6: "Fixtures are fetched per module as static
// JSON, not bundled." Fetches tools/copy-fixtures.mjs's output (apps/web/public/fixtures/) at
// runtime instead of reading packages/fixtures/data off disk — that path is Node-only (see
// packages/fixtures/loader.ts's header comment) and can't go in a browser bundle at all
// (confirmed by actually building it: SAS-052's first attempt failed on node:path/node:url).
//
// Imports `@sas/fixtures/schema` directly, not the package's default barrel — the barrel
// re-exports loader.ts, which is exactly the Node-only file above.
import { validateFixture, type ValidatedFixture } from '@sas/fixtures/schema';

export interface MeasuredFixturesResult {
  fixtures: ValidatedFixture[];
  /**
   * SAS-076 (E8) — true only when the manifest request itself failed (offline, blocked, a
   * missing `/fixtures/index.json`), never when the manifest loaded fine and simply lists zero
   * non-synthetic fixtures — that second case is today's ordinary, silent state (no capture
   * session has landed yet, see BACKLOG.md's E3 sequencing note) and must not read as an error.
   * docs/APP_STATE.md §5: "Fixture fetch fails → fall back to the model, badge flips to
   * MODELED, a quiet notice explains why" — this flag is what gates that notice.
   */
  fetchFailed: boolean;
}

let cached: Promise<MeasuredFixturesResult> | undefined;

async function fetchFixture(id: string): Promise<ValidatedFixture | undefined> {
  try {
    const response = await fetch(`/fixtures/${id}.json`);
    if (!response.ok) return undefined;
    return validateFixture(await response.json());
  } catch {
    return undefined;
  }
}

async function fetchIndex(): Promise<MeasuredFixturesResult> {
  let ids: string[];
  try {
    const manifestResponse = await fetch('/fixtures/index.json');
    if (!manifestResponse.ok) return { fixtures: [], fetchFailed: true };
    ids = await manifestResponse.json();
  } catch {
    // A fetch failure (offline, blocked, missing manifest) must never crash the module — it
    // just means every run falls back to simulate() and stays MODELED, same as having no
    // fixtures at all. The caller decides whether that's worth a quiet notice.
    return { fixtures: [], fetchFailed: true };
  }

  const fixtures = await Promise.all(ids.map(fetchFixture));
  // D3 (docs/SIMULATOR_SPEC.md §3): never let a synthetic fixture make the UI show MEASURED.
  const measured = fixtures.filter((fixture): fixture is ValidatedFixture => fixture !== undefined && !fixture.synthetic);
  return { fixtures: measured, fetchFailed: false };
}

/** Lazily fetches and caches the non-synthetic fixture index for the lifetime of the page. */
export function loadMeasuredFixtures(): Promise<MeasuredFixturesResult> {
  if (!cached) cached = fetchIndex();
  return cached;
}

/** Test-only: clears the module-level cache so each test starts from a clean slate. */
export function resetMeasuredFixturesCache(): void {
  cached = undefined;
}
