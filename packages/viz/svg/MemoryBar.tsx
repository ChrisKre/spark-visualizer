// A single instantaneous snapshot: execution/storage memory occupancy against capacity, plus
// spill. "Already-computed series in, render it" — computing a memory-over-time series from
// TaskResult's per-task peak values (there's no time-series memory field in RunResult) is
// explicitly not this component's job; that aggregation belongs to whatever calls it
// (apps/web today, or a future packages/sim rollup ahead of SAS-100/E11's memory module).
'use client';

import { formatBytes as defaultFormatBytes } from '@sas/ui';
import { useId, type JSX } from 'react';
import { ChartFrame, chartInnerArea } from '../primitives';
import styles from './MemoryBar.module.css';

export interface MemoryBarProps {
  executionMemoryBytes: number;
  storageMemoryBytes: number;
  executionCapacityBytes: number;
  storageCapacityBytes: number;
  spilledBytes: number;
  label?: string;
  formatBytes?: (bytes: number) => string;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}

const MARGIN = { top: 24, right: 16, bottom: 70, left: 16 };
const BAR_HEIGHT = 32;
const SPILL_BAR_HEIGHT = 10;

export function MemoryBar(props: MemoryBarProps): JSX.Element {
  const {
    executionMemoryBytes,
    storageMemoryBytes,
    executionCapacityBytes,
    storageCapacityBytes,
    spilledBytes,
    label,
    formatBytes = defaultFormatBytes,
    viewBoxWidth = 480,
    viewBoxHeight = 140,
  } = props;

  const spillPatternId = useId();
  const totalCapacity = Math.max(1, executionCapacityBytes + storageCapacityBytes);
  const { x0, y0, innerWidth } = chartInnerArea(viewBoxWidth, viewBoxHeight, MARGIN);

  const executionOom = executionMemoryBytes > executionCapacityBytes;
  const executionCapacityWidth = (executionCapacityBytes / totalCapacity) * innerWidth;
  const storageCapacityWidth = (storageCapacityBytes / totalCapacity) * innerWidth;
  const executionUsedWidth = (Math.min(executionMemoryBytes, executionCapacityBytes) / totalCapacity) * innerWidth;
  const storageUsedWidth = (Math.min(storageMemoryBytes, storageCapacityBytes) / totalCapacity) * innerWidth;

  // Spill has no natural capacity to scale against (it can exceed total memory many times
  // over) — the bar below is scaled relative to execution capacity purely to give a visual
  // sense of scale; the text label carries the real number, per "never color/shape alone."
  const spillWidth = Math.min(innerWidth, (spilledBytes / Math.max(1, executionCapacityBytes)) * innerWidth);

  const title = label ? `Memory usage, ${label}` : 'Memory usage';

  return (
    <ChartFrame viewBoxWidth={viewBoxWidth} viewBoxHeight={viewBoxHeight} title={title}>
      <rect x={x0} y={y0} width={innerWidth} height={BAR_HEIGHT} className={styles.track} />
      <rect x={x0} y={y0} width={executionCapacityWidth} height={BAR_HEIGHT} className={styles.executionCapacity} />
      <rect
        x={x0 + executionCapacityWidth}
        y={y0}
        width={storageCapacityWidth}
        height={BAR_HEIGHT}
        className={styles.storageCapacity}
      />
      <rect
        x={x0}
        y={y0}
        width={executionUsedWidth}
        height={BAR_HEIGHT}
        className={executionOom ? styles.executionOom : styles.executionUsed}
      />
      <rect
        x={x0 + executionCapacityWidth}
        y={y0}
        width={storageUsedWidth}
        height={BAR_HEIGHT}
        className={styles.storageUsed}
      />
      {executionOom ? (
        <text
          x={x0 + executionCapacityWidth / 2}
          y={y0 + BAR_HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className={styles.oomLabel}
        >
          OOM
        </text>
      ) : null}

      <text x={x0} y={y0 + BAR_HEIGHT + 16} className={styles.legend}>
        Execution: {formatBytes(executionMemoryBytes)} / {formatBytes(executionCapacityBytes)}
      </text>
      <text x={x0} y={y0 + BAR_HEIGHT + 32} className={styles.legend}>
        Storage: {formatBytes(storageMemoryBytes)} / {formatBytes(storageCapacityBytes)}
      </text>

      {spilledBytes > 0 ? (
        <>
          <defs>
            <pattern id={spillPatternId} width={6} height={6} patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width={6} height={6} className={styles.spillPatternBg} />
              <line x1={0} y1={0} x2={0} y2={6} className={styles.spillPatternLine} />
            </pattern>
          </defs>
          <rect
            x={x0}
            y={y0 + BAR_HEIGHT + 44}
            width={Math.max(2, spillWidth)}
            height={SPILL_BAR_HEIGHT}
            fill={`url(#${spillPatternId})`}
            className={styles.spillBar}
          />
          <text x={x0} y={y0 + BAR_HEIGHT + 68} className={styles.spillLabel}>
            Spilled to disk: {formatBytes(spilledBytes)}
          </text>
        </>
      ) : null}
    </ChartFrame>
  );
}
