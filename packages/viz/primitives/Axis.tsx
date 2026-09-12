// Bottom/left axis for linear or band scales. Every axis includes a tick at the scale's
// domain max, even when d3's default tick algorithm wouldn't land exactly on it — per
// DESIGN_SYSTEM.md §4, "every axis is labelled to a value the chart reaches."
import type { ScaleBand, ScaleLinear } from 'd3-scale';
import type { JSX } from 'react';
import styles from './Axis.module.css';

export interface AxisProps {
  orientation: 'bottom' | 'left';
  scale: ScaleLinear<number, number> | ScaleBand<string>;
  /** Approximate tick count for a linear scale; ignored for a band scale (one tick per category). */
  tickCount?: number;
  tickFormat?: (value: number | string) => string;
  label?: string;
  /** Translate of the whole axis group within the parent <svg>. */
  x?: number;
  y?: number;
}

interface Tick {
  value: number | string;
  position: number;
}

function isBandScale(scale: ScaleLinear<number, number> | ScaleBand<string>): scale is ScaleBand<string> {
  return typeof (scale as ScaleBand<string>).bandwidth === 'function';
}

function linearTicks(scale: ScaleLinear<number, number>, tickCount: number): Tick[] {
  const domain = scale.domain();
  const domainMax = domain[1] ?? 0;
  const values = new Set<number>(scale.ticks(tickCount));
  values.add(domainMax);
  return Array.from(values)
    .sort((a, b) => a - b)
    .map((value) => ({ value, position: scale(value) }));
}

function bandTicks(scale: ScaleBand<string>): Tick[] {
  const bandwidth = scale.bandwidth();
  return scale.domain().map((value) => ({
    value,
    position: (scale(value) ?? 0) + bandwidth / 2,
  }));
}

export function Axis(props: AxisProps): JSX.Element {
  const { orientation, scale, tickCount = 5, tickFormat, label, x = 0, y = 0 } = props;
  const band = isBandScale(scale);
  const ticks = band ? bandTicks(scale) : linearTicks(scale, tickCount);
  const format = tickFormat ?? ((v: number | string) => String(v));
  const isBottom = orientation === 'bottom';

  return (
    <g transform={`translate(${x}, ${y})`} className={styles.axis}>
      {ticks.map((tick) => (
        <g
          key={String(tick.value)}
          transform={isBottom ? `translate(${tick.position}, 0)` : `translate(0, ${tick.position})`}
        >
          <line x1={isBottom ? 0 : -6} x2={0} y1={0} y2={isBottom ? 6 : 0} className={styles.tickLine} />
          <text
            x={isBottom ? 0 : -10}
            y={isBottom ? 20 : 4}
            textAnchor={isBottom ? 'middle' : 'end'}
            className={styles.tickLabel}
          >
            {format(tick.value)}
          </text>
        </g>
      ))}
      {label ? (
        <text x={isBottom ? 0 : -40} y={isBottom ? 36 : -12} textAnchor="start" className={styles.axisLabel}>
          {label}
        </text>
      ) : null}
    </g>
  );
}
