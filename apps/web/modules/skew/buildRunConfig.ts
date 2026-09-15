// SAS-051 (E6) — turns the module's flat knobs map into a full RunConfig, layered on
// DEFAULT_RUN_CONFIG so every field the knobs don't touch keeps the simulator's own default.
import { DEFAULT_RUN_CONFIG, type RunConfig } from '@sas/sim';
import { defaultFor } from './knobs';

export function buildRunConfig(knobs: Record<string, number>): RunConfig {
  const a = knobs.a ?? defaultFor('a');
  const salt = knobs.salt ?? defaultFor('salt');
  const nulls = knobs.nulls ?? defaultFor('nulls');
  const ex = knobs.ex ?? defaultFor('ex');
  const sp = knobs.sp ?? defaultFor('sp');

  return {
    ...DEFAULT_RUN_CONFIG,
    cluster: { ...DEFAULT_RUN_CONFIG.cluster, executors: ex },
    sql: { ...DEFAULT_RUN_CONFIG.sql, shufflePartitions: sp },
    data: { ...DEFAULT_RUN_CONFIG.data, zipfAlpha: a, saltFactor: salt, nullFraction: nulls },
  };
}
