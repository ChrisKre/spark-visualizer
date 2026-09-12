// 200 bars per pane, descending, one shared y-scale across before/after panes so the
// comparison is honest (BACKLOG SAS-041: "before/after panes share one y-scale"). The
// tallest bar across all panes carries a text annotation + leader line — never color alone —
// and the whole thing ships a visually-hidden data table as the Canvas-free but still
// non-visual-reliant accessible equivalent.
'use client';

import { formatBytes as defaultFormatBytes } from '@sas/ui';
import type { JSX } from 'react';
import { Axis, ChartFrame, chartInnerArea, createBandScale, createLinearScale } from '../primitives';
import styles from './PartitionHistogram.module.css';

export interface PartitionHistogramPane {
  label: string;
  /** StageResult.partitionBytes passes straight in — order doesn't matter, this sorts. */
  partitionBytes: number[];
}

export interface PartitionHistogramProps {
  /** One pane for a single run, two for a before/after compare. */
  panes: PartitionHistogramPane[];
  formatBytes?: (bytes: number) => string;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}

interface RankedBar {
  rank: number;
  bytes: number;
}

const MARGIN = { top: 28, right: 16, bottom: 40, left: 64 };
const PANE_GAP = 24;

export function PartitionHistogram(props: PartitionHistogramProps): JSX.Element {
  const { panes, formatBytes = defaultFormatBytes, viewBoxWidth = 640, viewBoxHeight = 280 } = props;

  const rankedPanes = panes.map((pane) => ({
    label: pane.label,
    bars: [...pane.partitionBytes].sort((a, b) => b - a).map((bytes, rank): RankedBar => ({ rank, bytes })),
  }));

  const maxBytes = Math.max(1, ...rankedPanes.flatMap((pane) => pane.bars.map((bar) => bar.bytes)));
  const { x0, y0, y1, innerWidth } = chartInnerArea(viewBoxWidth, viewBoxHeight, MARGIN);
  const yScale = createLinearScale([0, maxBytes], [y1, y0]);

  const paneCount = Math.max(1, rankedPanes.length);
  const totalGap = PANE_GAP * (paneCount - 1);
  const paneWidth = (innerWidth - totalGap) / paneCount;

  const paneLayouts = rankedPanes.map((pane, index) => {
    const paneX0 = x0 + index * (paneWidth + PANE_GAP);
    return {
      ...pane,
      paneX0,
      xScale: createBandScale(
        pane.bars.map((bar) => String(bar.rank)),
        [paneX0, paneX0 + paneWidth],
        0.1,
      ),
    };
  });

  let tallestPaneIndex = -1;
  let tallestBar: RankedBar | undefined;
  paneLayouts.forEach((pane, index) => {
    const top = pane.bars[0];
    if (top && (!tallestBar || top.bytes > tallestBar.bytes)) {
      tallestBar = top;
      tallestPaneIndex = index;
    }
  });
  const tallestPane = tallestPaneIndex >= 0 ? paneLayouts[tallestPaneIndex] : undefined;

  const title =
    panes.length > 1
      ? `Partition size distribution, ${panes.map((pane) => pane.label).join(' vs. ')}`
      : `Partition size distribution${panes[0]?.label ? `, ${panes[0].label}` : ''}`;

  return (
    <div>
      <ChartFrame viewBoxWidth={viewBoxWidth} viewBoxHeight={viewBoxHeight} title={title}>
        <Axis orientation="left" scale={yScale} x={x0} tickFormat={(v) => formatBytes(Number(v))} label="Partition size" />
        {paneLayouts.map((pane) => (
          <g key={pane.label}>
            {pane.bars.map((bar) => {
              const barX = pane.xScale(String(bar.rank)) ?? pane.paneX0;
              const barWidth = pane.xScale.bandwidth();
              const barY = yScale(bar.bytes);
              const isTallest = tallestBar === bar;
              return (
                <rect
                  key={bar.rank}
                  x={barX}
                  y={barY}
                  width={Math.max(0.5, barWidth)}
                  height={Math.max(0, y1 - barY)}
                  className={isTallest ? styles.barTallest : styles.bar}
                />
              );
            })}
            <text x={pane.paneX0 + paneWidth / 2} y={y1 + 24} textAnchor="middle" className={styles.paneLabel}>
              {pane.label}
            </text>
          </g>
        ))}
        {tallestPane && tallestBar ? (
          <g>
            <line
              x1={(tallestPane.xScale(String(tallestBar.rank)) ?? 0) + tallestPane.xScale.bandwidth() / 2}
              x2={(tallestPane.xScale(String(tallestBar.rank)) ?? 0) + tallestPane.xScale.bandwidth() / 2}
              y1={yScale(tallestBar.bytes)}
              y2={Math.max(y0, yScale(tallestBar.bytes) - 20)}
              className={styles.leaderLine}
            />
            <text
              x={(tallestPane.xScale(String(tallestBar.rank)) ?? 0) + tallestPane.xScale.bandwidth() / 2}
              y={Math.max(y0, yScale(tallestBar.bytes) - 24)}
              textAnchor="middle"
              className={styles.annotation}
            >
              {formatBytes(tallestBar.bytes)} in one partition
            </text>
          </g>
        ) : null}
      </ChartFrame>
      <table className={styles.srOnly}>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Pane</th>
            <th scope="col">Rank</th>
            <th scope="col">Bytes</th>
          </tr>
        </thead>
        <tbody>
          {rankedPanes.flatMap((pane) =>
            pane.bars.map((bar) => (
              <tr key={`${pane.label}-${bar.rank}`}>
                <td>{pane.label}</td>
                <td>{bar.rank + 1}</td>
                <td>{formatBytes(bar.bytes)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
