// Split out of resolve.ts (SAS-054) for the same reason toRunResult.ts was split out of
// loader.ts: this has no node:fs/node:path/node:url dependency, so apps/web's browser-side
// fixture resolver (SAS-054) can import the exact same snapping rule resolve.ts uses, rather
// than re-deriving (and risking drift from) SIMULATOR_SPEC.md's declared epsilon.
import type { RunConfig } from '@sas/sim';
import type { ValidatedFixture } from './schema';

/** M1's declared epsilon (docs/SIMULATOR_SPEC.md §3). Every other knob below must match exactly. */
export const ZIPF_ALPHA_EPSILON = 0.05;

/**
 * Whether `requested` is within snapping distance of `fixture`. Expressed only in terms of the
 * documented `config` display block (zipfAlpha/saltFactor/shufflePartitions/aqe) — a known v1
 * limitation: M2's richer knobs (advisory size, skew factor, estimate error) aren't captured by
 * that block, so this match rule is exact-only for M1-shaped configs and coarse for M2 ones.
 * Widening `config` to carry module-specific knobs is a follow-up, not part of E3.
 */
export function configMatches(requested: RunConfig, fixture: ValidatedFixture): boolean {
  const c = fixture.config;
  return (
    Math.abs(requested.data.zipfAlpha - c.zipfAlpha) <= ZIPF_ALPHA_EPSILON &&
    requested.data.saltFactor === c.saltFactor &&
    requested.sql.shufflePartitions === c.shufflePartitions &&
    requested.sql.adaptive.enabled === c.aqe
  );
}
