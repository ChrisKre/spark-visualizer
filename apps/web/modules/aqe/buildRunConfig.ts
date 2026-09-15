// SAS-061 (E7) — turns the module's flat knobs map into a full RunConfig.
//
// Base data: 2,000,000 rows over 200 shuffle partitions, 200 distinct keys, zipfAlpha 0
// (uniform — this module has no skew-severity knob, unlike M1). Verified directly against the
// simulator: hashing 200 keys into 200 partitions produces real, honest skew from hash
// collisions alone (max partition ~4x the median), which is enough for `optimizeSkewedJoin` to
// fire once `skf` is turned down toward its minimum, without needing a deliberately-skewed key
// distribution — that's M1's story, not this one. `skewedPartitionThresholdMiB` is hand-tuned
// to 64 (not knob-controlled — no knob maps to it, and RunConfig's own 256 MiB default never
// fires at this data scale): same kind of scenario-tuning skew/buildRunConfig.ts's own
// SCENARIO_BASE comment describes doing.
//
// `query.other` is genuinely tiny (1,000 rows x 128 B, ~0.12 MiB actual) so its ACTUAL
// materialised size always sits under `autoBroadcastJoinThresholdMiB` (10 MiB, unchanged from
// RunConfig's default) — what gates `dynamicJoinSelection` firing is purely whether `est`
// pushed the plan-time ESTIMATE high enough to make the initial plan a SortMergeJoin in the
// first place. Verified against packages/sim/plan/build.ts's selectJoinStrategy: the cutoff is
// otherEstimatedBytes > autoBroadcastJoinThresholdMiB x 3 (the ShuffledHashJoin/SortMergeJoin
// boundary), i.e. estimateErrorFactor gtr ~246 at this sizing — comfortably below the `est`
// knob's max (exponent 3 -> x1000), comfortably above its default (exponent 2 -> x100).
//
// At knob defaults (aqe on, adv 64, skf 5, est x100): only coalesceShufflePartitions fires — a
// real, non-zero task-count win over AQE-off, satisfying BACKLOG.md's SAS-064 acceptance bar
// ("the ribbon shows the task-count delta from coalescing") out of the box. Turning skf down
// toward 2 additionally fires optimizeSkewedJoin; turning est up toward 3 (x1000) additionally
// fires dynamicJoinSelection — each rule is independently knob-discoverable rather than all
// three being forced to fire together at hard defaults. See buildRunConfig.test.ts for the
// exact rewrite-sets this locks in.
import { DEFAULT_RUN_CONFIG, type RunConfig } from '@sas/sim';
import { defaultFor } from './knobs';

// A dedicated constant, not read back off SCENARIO_BASE.query — that field is typed as the
// QuerySpec union, and spreading a union member to add `estimateErrorFactor` back in buildRunConfig
// below would make every other QuerySpec variant look like a valid target too.
const OTHER = { rows: 1000, bytesPerRow: 128 };

const SCENARIO_BASE: RunConfig = {
  ...DEFAULT_RUN_CONFIG,
  sql: {
    ...DEFAULT_RUN_CONFIG.sql,
    adaptive: { ...DEFAULT_RUN_CONFIG.sql.adaptive, skewedPartitionThresholdMiB: 64 },
  },
  data: { ...DEFAULT_RUN_CONFIG.data, rows: 2_000_000, bytesPerRow: 2000, keyCardinality: 200, zipfAlpha: 0 },
  query: { kind: 'join', joinType: 'inner', other: OTHER },
};

export function buildRunConfig(knobs: Record<string, number>): RunConfig {
  const aqe = knobs.aqe ?? defaultFor('aqe');
  const adv = knobs.adv ?? defaultFor('adv');
  const skf = knobs.skf ?? defaultFor('skf');
  const est = knobs.est ?? defaultFor('est');

  return {
    ...SCENARIO_BASE,
    sql: {
      ...SCENARIO_BASE.sql,
      adaptive: {
        ...SCENARIO_BASE.sql.adaptive,
        enabled: aqe === 1,
        advisoryPartitionSizeMiB: adv,
        skewedPartitionFactor: skf,
      },
    },
    query: { kind: 'join', joinType: 'inner', other: OTHER, estimateErrorFactor: 10 ** est },
  };
}
