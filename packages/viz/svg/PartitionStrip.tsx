// SAS-063 (E7) — a one-row-per-pane strip of partition-sized cells, in ORIGINAL partition
// order (never sorted — a merge only reads correctly in original order, unlike
// PartitionHistogram's ranked bars). Each cell's WIDTH is proportional to its byte share of
// the pane's total, so a shrinking cell count with each cell growing wider directly visualises
// "N partitions merged into M" (docs/modules/m2-aqe.md §4: "cheap to build, and it makes
// coalescing legible in a way the plan tree alone does not"). Static per render — no
// fade/enter-exit state machine like PlanTree's; the caller (apps/web/modules/aqe) decides
// which "after" cell array to show — see partitionStripCells.ts there for why that can't be
// StageResult.partitionBytes directly.
'use client';

import { formatBytes as defaultFormatBytes } from '@sas/ui';
import type { JSX } from 'react';
import { ChartFrame, chartInnerArea } from '../primitives';
import styles from './PartitionStrip.module.css';

export interface PartitionStripPane {
  label: string;
  /** Stable partition order — do not sort; a merge only reads correctly in original order. */
  partitionBytes: number[];
}

export interface PartitionStripProps {
  before: PartitionStripPane;
  after: PartitionStripPane;
  formatBytes?: (bytes: number) => string;
  viewBoxWidth?: number;
  viewBoxHeight?: number;
}

interface CellLayout {
  index: number;
  x: number;
  width: number;
  bytes: number;
}

const MARGIN = { top: 8, right: 16, bottom: 8, left: 16 };
const ROW_HEIGHT = 32;
const ROW_GAP = 40;
const LABEL_OFFSET = 16;

function layoutRow(partitionBytes: number[], x0: number, innerWidth: number): CellLayout[] {
  const total = partitionBytes.reduce((sum, bytes) => sum + bytes, 0) || 1;
  let x = x0;
  return partitionBytes.map((bytes, index) => {
    const width = (bytes / total) * innerWidth;
    const cell: CellLayout = { index, x, width, bytes };
    x += width;
    return cell;
  });
}

export function PartitionStrip(props: PartitionStripProps): JSX.Element {
  const { before, after, formatBytes = defaultFormatBytes, viewBoxWidth = 640, viewBoxHeight = 140 } = props;

  const { x0, y0, innerWidth } = chartInnerArea(viewBoxWidth, viewBoxHeight, MARGIN);
  const beforeCells = layoutRow(before.partitionBytes, x0, innerWidth);
  const afterCells = layoutRow(after.partitionBytes, x0, innerWidth);
  const afterY = y0 + ROW_HEIGHT + ROW_GAP;

  const title = `Partition strip, ${before.label} (${before.partitionBytes.length} partitions) vs. ${after.label} (${after.partitionBytes.length} partitions)`;

  function renderRow(cells: CellLayout[], rowY: number, label: string, count: number) {
    return (
      <g>
        {cells.map((cell) => (
          <rect key={cell.index} x={cell.x} y={rowY} width={Math.max(0, cell.width)} height={ROW_HEIGHT} className={styles.cell} />
        ))}
        <text x={x0} y={rowY + ROW_HEIGHT + LABEL_OFFSET} className={styles.rowLabel}>
          {label} ({count})
        </text>
      </g>
    );
  }

  return (
    <div>
      <ChartFrame viewBoxWidth={viewBoxWidth} viewBoxHeight={viewBoxHeight} title={title}>
        {renderRow(beforeCells, y0, before.label, beforeCells.length)}
        {renderRow(afterCells, afterY, after.label, afterCells.length)}
      </ChartFrame>
      <table className={styles.srOnly}>
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Pane</th>
            <th scope="col">Partition</th>
            <th scope="col">Bytes</th>
          </tr>
        </thead>
        <tbody>
          {[
            { pane: before.label, cells: beforeCells },
            { pane: after.label, cells: afterCells },
          ].flatMap(({ pane, cells }) =>
            cells.map((cell) => (
              <tr key={`${pane}-${cell.index}`}>
                <td>{pane}</td>
                <td>{cell.index + 1}</td>
                <td>{formatBytes(cell.bytes)}</td>
              </tr>
            )),
          )}
        </tbody>
      </table>
    </div>
  );
}
