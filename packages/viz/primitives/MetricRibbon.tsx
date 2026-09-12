// Sticky metric ribbon — single-run values, or a before/after/signed-delta compare. Delta
// color reflects whether the change is good or bad per metric (`lowerIsBetter`), never the
// raw sign alone; the arrow glyph shows direction so nothing here is color-only. CPU-s
// (`alwaysVisible`) never gets the narrow-width collapse class the other metrics get.
'use client';

import { formatSignedDelta } from '@sas/ui';
import type { JSX } from 'react';
import { DEFAULT_METRICS, type MetricDef, type MetricKey } from './metricDefs';
import styles from './MetricRibbon.module.css';

export type MetricValues = Partial<Record<MetricKey, number>>;

export interface MetricRibbonSingleProps {
  mode: 'single';
  values: MetricValues;
  metrics?: MetricDef[];
}

export interface MetricRibbonCompareProps {
  mode: 'compare';
  before: MetricValues;
  after: MetricValues;
  metrics?: MetricDef[];
}

export type MetricRibbonProps = MetricRibbonSingleProps | MetricRibbonCompareProps;

function SingleValue({ metric, value }: { metric: MetricDef; value: number | undefined }): JSX.Element {
  return <div className={`${styles.value} tabular-nums`}>{value === undefined ? '—' : metric.format(value)}</div>;
}

function CompareValue({
  metric,
  before,
  after,
}: {
  metric: MetricDef;
  before: number | undefined;
  after: number | undefined;
}): JSX.Element {
  if (before === undefined || after === undefined) {
    return <div className={`${styles.value} tabular-nums`}>{'—'}</div>;
  }

  const delta = after - before;
  const direction = delta * (metric.lowerIsBetter ? 1 : -1);
  const trendClass = direction > 0 ? styles.worse : direction < 0 ? styles.better : styles.neutral;
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—';

  return (
    <div className={styles.compare}>
      <span className={`${styles.beforeAfter} tabular-nums`}>{metric.format(before)}</span>
      <span className={`${styles.beforeAfter} tabular-nums`}>{metric.format(after)}</span>
      <span className={`${styles.delta} ${trendClass} tabular-nums`}>
        <span aria-hidden="true">{arrow}</span> {formatSignedDelta(delta, metric.format)}
      </span>
    </div>
  );
}

export function MetricRibbon(props: MetricRibbonProps): JSX.Element {
  const metrics = props.metrics ?? DEFAULT_METRICS;

  return (
    <div className={styles.ribbon} role="table" aria-label="Run metrics">
      <div className={styles.row} role="row">
        {metrics.map((metric) => (
          <div
            key={metric.key}
            role="cell"
            className={`${styles.cell} ${metric.alwaysVisible ? styles.alwaysVisible : styles.collapsible}`}
          >
            <div className={styles.label}>{metric.label}</div>
            {props.mode === 'single' ? (
              <SingleValue metric={metric} value={props.values[metric.key]} />
            ) : (
              <CompareValue metric={metric} before={props.before[metric.key]} after={props.after[metric.key]} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
