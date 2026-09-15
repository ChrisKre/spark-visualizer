// The six-metric definition list MetricRibbon renders, in the fixed order BACKLOG specifies:
// "wall clock · CPU-s · straggler ratio · shuffle read · disk spilled · GC %".
import { formatBytes, formatCount, formatDuration, formatPercent, formatRatio } from '@sas/ui';

export type MetricKey =
  | 'wallClockMs'
  | 'cpuSeconds'
  | 'stragglerRatio'
  | 'shuffleReadBytes'
  | 'diskSpilledBytes'
  | 'gcPercent'
  | 'taskCount';

export interface MetricDef {
  key: MetricKey;
  label: string;
  format: (value: number) => string;
  /** Whether a lower value is the better outcome. All six are `true` today, but this is a
   *  per-metric flag (not a blanket assumption) because M2 adds a 7th metric (task count,
   *  also lower-is-better) and future metrics could differ. */
  lowerIsBetter: boolean;
  /** Only `cpuSeconds` carries this — "never hidden at narrow widths" (BACKLOG SAS-043): it's
   *  the column that "carries the core lesson" of skew (flat CPU-s, exploding wall clock). */
  alwaysVisible?: boolean;
}

export const DEFAULT_METRICS: MetricDef[] = [
  { key: 'wallClockMs', label: 'Wall clock', format: formatDuration, lowerIsBetter: true },
  {
    key: 'cpuSeconds',
    label: 'CPU-s',
    format: (seconds) => formatDuration(seconds * 1000),
    lowerIsBetter: true,
    alwaysVisible: true,
  },
  { key: 'stragglerRatio', label: 'Straggler ratio', format: formatRatio, lowerIsBetter: true },
  { key: 'shuffleReadBytes', label: 'Shuffle read', format: formatBytes, lowerIsBetter: true },
  { key: 'diskSpilledBytes', label: 'Disk spilled', format: formatBytes, lowerIsBetter: true },
  { key: 'gcPercent', label: 'GC %', format: formatPercent, lowerIsBetter: true },
];

// M2's 7th metric (BACKLOG SAS-064/docs/modules/m2-aqe.md §5): "same six metrics as M1, plus
// task count — because the headline win from coalescing is the tasks that never launch."
// Composed onto DEFAULT_METRICS by the caller (via MetricRibbon's own `metrics?` override
// prop) rather than added to DEFAULT_METRICS itself, so M1's own ribbon stays unchanged.
export const TASK_COUNT_METRIC: MetricDef = { key: 'taskCount', label: 'Task count', format: formatCount, lowerIsBetter: true };
