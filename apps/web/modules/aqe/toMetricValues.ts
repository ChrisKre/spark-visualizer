// SAS-064 (E7) — RunResult -> MetricRibbon's MetricValues, plus the 7th metric M2 adds: task
// count. Not part of RunMetrics (no sim change needed) — it's just `run.tasks.length`, the
// headline win from coalescing (docs/modules/m2-aqe.md §5: "the tasks that never launch").
import { DEFAULT_METRICS, TASK_COUNT_METRIC, type MetricDef, type MetricValues } from '@sas/viz';
import type { RunResult } from '@sas/sim';

export const AQE_METRICS: MetricDef[] = [...DEFAULT_METRICS, TASK_COUNT_METRIC];

export function toMetricValues(run: RunResult): MetricValues {
  return {
    wallClockMs: run.metrics.wallClockMs,
    cpuSeconds: run.metrics.cpuSeconds,
    stragglerRatio: run.metrics.stragglerRatio,
    shuffleReadBytes: run.metrics.shuffleReadBytes,
    diskSpilledBytes: run.metrics.diskSpilledBytes,
    gcPercent: run.metrics.gcPercent,
    taskCount: run.tasks.length,
  };
}
