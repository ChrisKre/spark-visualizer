// The six-metric definition list MetricRibbon renders, in the fixed order BACKLOG specifies:
// "wall clock · CPU-s · straggler ratio · shuffle read · disk spilled · GC %".
import { formatBytes, formatDuration, formatPercent, formatRatio } from '@sas/ui';

export type MetricKey =
  | 'wallClockMs'
  | 'cpuSeconds'
  | 'stragglerRatio'
  | 'shuffleReadBytes'
  | 'diskSpilledBytes'
  | 'gcPercent';

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
