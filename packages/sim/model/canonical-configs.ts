// SAS-019 — the 12 canonical configs golden/invariant/monotonicity tests run against. Chosen to
// mirror the coverage shape of the E3 fixture grid (docs/FIXTURES.md §5) so fixtures can later be
// sanity-checked against these same shapes, though that wiring is out of scope for this ticket.
//
// Every config uses a large "other" side so the join actually shuffles (SortMergeJoin, with an
// Exchange for AQE's coalesce/skew-split rules to act on) rather than defaulting to a broadcast
// join — see plan/build.ts.

import type { RunConfig } from '../types';
import { testConfig } from './test-helpers';

const shuffledJoinQuery: RunConfig['query'] = {
  kind: 'join',
  joinType: 'inner',
  other: { rows: 2_000_000, bytesPerRow: 128 },
};

// Large enough in aggregate (~4 GB) that the default 64 MiB advisory partition size doesn't
// coalesce everything down to a single partition regardless of skew — that would wash out the
// very skew differences these configs exist to exercise. ZIPF_SAMPLE_CAP keeps this cheap
// regardless of `rows` — see skew/partition.ts.
const data = { rows: 2_000_000, keyCardinality: 200, bytesPerRow: 2000 };

export const CANONICAL_CONFIGS: Record<string, RunConfig> = {
  uniform: testConfig({ query: shuffledJoinQuery, data: { ...data, zipfAlpha: 0 } }),
  'mild-skew': testConfig({ query: shuffledJoinQuery, data: { ...data, zipfAlpha: 0.8 } }),
  'visible-straggler': testConfig({ query: shuffledJoinQuery, data: { ...data, zipfAlpha: 1.2 } }),
  'hero-before': testConfig({ query: shuffledJoinQuery, data: { ...data, zipfAlpha: 1.6, saltFactor: 1 } }),
  'partial-fix': testConfig({ query: shuffledJoinQuery, data: { ...data, zipfAlpha: 1.6, saltFactor: 4 } }),
  'hero-after': testConfig({ query: shuffledJoinQuery, data: { ...data, zipfAlpha: 1.6, saltFactor: 8 } }),
  'null-trap': testConfig({ query: shuffledJoinQuery, data: { ...data, zipfAlpha: 0, nullFraction: 0.03 } }),
  'severe-skew': testConfig({ query: shuffledJoinQuery, data: { ...data, zipfAlpha: 2.0, saltFactor: 8 } }),
  'aqe-off': testConfig({
    query: shuffledJoinQuery,
    data: { ...data, zipfAlpha: 1.6 },
    sql: { adaptive: { enabled: false } },
  }),
  'aqe-coalesce-only': testConfig({
    query: shuffledJoinQuery,
    data: { ...data, zipfAlpha: 0, rows: 50_000 }, // small -> partitions well under the advisory size
    sql: { shufflePartitions: 200, adaptive: { enabled: true, advisoryPartitionSizeMiB: 64 } },
  }),
  'aqe-skew-split': testConfig({
    // A large enough total (~200 MiB/partition on average) that the mean stays above the
    // advisory size and coalesce does NOT also fire — isolating optimizeSkewedJoin so its
    // partition-count increase actually reaches model/run.ts's split() path, rather than being
    // immediately re-shrunk by a coalesce rewrite running right after it.
    query: shuffledJoinQuery,
    data: { rows: 20_000_000, keyCardinality: 200, bytesPerRow: 2000, zipfAlpha: 2.2, nullFraction: 0, saltFactor: 1 },
    sql: { adaptive: { enabled: true, skewJoinEnabled: true, skewedPartitionThresholdMiB: 1, skewedPartitionFactor: 2 } },
  }),
  'aqe-join-switch': testConfig({
    // The "other" side is genuinely tiny (~0.12 MiB) but the planner's estimate is wrong by
    // 100000x, forcing a SortMergeJoin at plan time; AQE discovers the true size afterward and
    // should flip it to a BroadcastHashJoin.
    query: { kind: 'join', joinType: 'inner', other: { rows: 1000, bytesPerRow: 128 }, estimateErrorFactor: 100_000 },
    data: { ...data, zipfAlpha: 0 },
    sql: { adaptive: { enabled: true } },
  }),
};

/** Looks up a canonical config by name, throwing on a typo — `CANONICAL_CONFIGS[x]` alone is
 * typed `RunConfig | undefined` under `noUncheckedIndexedAccess`. */
export function canonicalConfig(name: keyof typeof CANONICAL_CONFIGS): RunConfig {
  const config = CANONICAL_CONFIGS[name];
  if (!config) throw new Error(`Unknown canonical config: ${name}`);
  return config;
}
