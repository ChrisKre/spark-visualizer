// SAS-051/052 (E6) — turns the module's flat knobs map into a full RunConfig.
//
// This does NOT start from packages/sim's own DEFAULT_RUN_CONFIG: that config's dimension
// side (`query.other`, 265 tiny rows) sits well under autoBroadcastJoinThresholdMiB, so the
// planner picks a BroadcastHashJoin — no shuffle on the fact side at all, and therefore no
// partition for `a`/`nulls` to skew. SCENARIO_BASE instead scales both sides up (still well
// under fixture-comparable data sizes) so a ShuffledHashJoin/SortMergeJoin is actually chosen,
// which is the whole precondition for this module to have anything to show. Verified against
// the simulator directly: at these numbers, skew produces the intended 1-2 order-of-magnitude
// stragglerRatio swing between salt=1 and salt=8 while cpuSeconds stays flat (< 0.1% apart) —
// matching docs/modules/m1-skew.md §5's "watch CPU-s stay flat while wall clock explodes".
import { DEFAULT_RUN_CONFIG, type RunConfig } from '@sas/sim';
import { defaultFor } from './knobs';

const SCENARIO_BASE: RunConfig = {
  ...DEFAULT_RUN_CONFIG,
  data: { ...DEFAULT_RUN_CONFIG.data, rows: 3_000_000, bytesPerRow: 200 },
  query: { kind: 'join', joinType: 'inner', other: { rows: 150_000, bytesPerRow: 128 } },
};

export function buildRunConfig(knobs: Record<string, number>): RunConfig {
  const a = knobs.a ?? defaultFor('a');
  const salt = knobs.salt ?? defaultFor('salt');
  const nulls = knobs.nulls ?? defaultFor('nulls');
  const ex = knobs.ex ?? defaultFor('ex');
  const sp = knobs.sp ?? defaultFor('sp');

  return {
    ...SCENARIO_BASE,
    cluster: { ...SCENARIO_BASE.cluster, executors: ex },
    sql: { ...SCENARIO_BASE.sql, shufflePartitions: sp },
    data: { ...SCENARIO_BASE.data, zipfAlpha: a, saltFactor: salt, nullFraction: nulls },
  };
}
