// SAS-052 (E6) — RunResult.metrics -> MetricRibbon's MetricValues. Same widening as
// toTimelineTasks.ts: RunMetrics' field names already match MetricKey one-for-one.
import type { RunMetrics } from '@sas/sim';
import type { MetricValues } from '@sas/viz';

export function toMetricValues(metrics: RunMetrics): MetricValues {
  return {
    wallClockMs: metrics.wallClockMs,
    cpuSeconds: metrics.cpuSeconds,
    stragglerRatio: metrics.stragglerRatio,
    shuffleReadBytes: metrics.shuffleReadBytes,
    diskSpilledBytes: metrics.diskSpilledBytes,
    gcPercent: metrics.gcPercent,
  };
}
