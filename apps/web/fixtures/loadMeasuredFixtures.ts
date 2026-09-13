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

let cached: Promise<ValidatedFixture[]> | undefined;

async function fetchFixture(id: string): Promise<ValidatedFixture | undefined> {
  try {
    const response = await fetch(`/fixtures/${id}.json`);
    if (!response.ok) return undefined;
    return validateFixture(await response.json());
  } catch {
    return undefined;
  }
}

async function fetchIndex(): Promise<ValidatedFixture[]> {
  try {
    const manifestResponse = await fetch('/fixtures/index.json');
    if (!manifestResponse.ok) return [];
    const ids: string[] = await manifestResponse.json();

    const fixtures = await Promise.all(ids.map(fetchFixture));
    // D3 (docs/SIMULATOR_SPEC.md §3): never let a synthetic fixture make the UI show MEASURED.
    return fixtures.filter((fixture): fixture is ValidatedFixture => fixture !== undefined && !fixture.synthetic);
  } catch {
    // A fetch failure (offline, blocked, missing manifest) must never crash the module — it
    // just means every run falls back to simulate() and stays MODELED, same as having no
    // fixtures at all.
    return [];
  }
}

/** Lazily fetches and caches the non-synthetic fixture index for the lifetime of the page. */
export function loadMeasuredFixtures(): Promise<ValidatedFixture[]> {
  if (!cached) cached = fetchIndex();
  return cached;
}

/** Test-only: clears the module-level cache so each test starts from a clean slate. */
export function resetMeasuredFixturesCache(): void {
  cached = undefined;
}
