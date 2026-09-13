// SAS-054 — the actual snap-or-simulate decision, factored out of resolve.ts so it has no
// node:fs/node:path/node:url dependency (transitively, via loader.ts) and can be imported by
// a browser bundle. `resolve.ts`'s `resolveRun` is a thin Node-only wrapper that supplies the
// default index (real, filesystem-backed) on top of this; apps/web's browser-side fixture
// fetcher supplies its own (fetch()-backed) index and calls this directly.
import { simulate } from '@sas/sim';
import type { RunConfig, RunResult } from '@sas/sim';
import { configMatches } from './matchConfig';
import type { ValidatedFixture } from './schema';
import { toRunResult } from './toRunResult';

/** Returns a fixture's recorded run if `config` snaps to one in `fixtures`, else `simulate()`. */
export function snapOrSimulate(config: RunConfig, seed: number, fixtures: ValidatedFixture[]): RunResult {
  const match = fixtures.find((fixture) => configMatches(config, fixture));
  if (match) {
    return { ...toRunResult(match), fixtureId: match.id };
  }
  return simulate(config, seed);
}
