/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PartitionHistogram } from './PartitionHistogram';
import styles from './PartitionHistogram.module.css';

afterEach(cleanup);

describe('PartitionHistogram', () => {
  it('gives before/after panes one shared y-scale — equal bytes produce equal bar heights', () => {
    const { container } = render(
      <PartitionHistogram
        panes={[
          { label: 'before', partitionBytes: [1000, 500, 100] },
          { label: 'after', partitionBytes: [1000, 300] },
        ]}
      />,
    );
    const rects = Array.from(container.querySelectorAll('rect'));
    // Both panes have a bar of exactly 1000 bytes; under one shared scale, the two tallest
    // bars (one per pane) must render at the same pixel height regardless of pane.
    const heights = rects.map((r) => Number(r.getAttribute('height')));
    // The two largest heights correspond to the two 1000-byte bars (one per pane, both ranked 0).
    const sortedHeights = [...heights].sort((a, b) => b - a);
    expect(sortedHeights[0]).toBeCloseTo(sortedHeights[1] ?? -1, 5);
  });

  it('annotates exactly the single tallest bar across all panes, with a text label', () => {
    render(
      <PartitionHistogram
        panes={[
          { label: 'before', partitionBytes: [4_400_000_000, 200_000, 100_000] },
          { label: 'after', partitionBytes: [500_000, 300_000] },
        ]}
      />,
    );
    expect(screen.getByText(/in one partition/)).toBeInTheDocument();
    expect(screen.getAllByText(/in one partition/)).toHaveLength(1);
  });

  it('positions the annotation above its bar with real leader-line length — never collapsed onto the axis', () => {
    // Regression test: the tallest bar's own top always sits exactly at the plot area's top
    // edge (it defines the y-scale's domain max) — an earlier bug clamped the leader line and
    // annotation to that same y, collapsing the line to zero length and stamping the text
    // directly on top of the axis's topmost tick label.
    const { container } = render(
      <PartitionHistogram panes={[{ label: 'run', partitionBytes: [4_400_000_000, 200_000, 100_000] }]} />,
    );
    // Axis renders its own tick <line>s first in document order — target the leader line
    // specifically by class, not the first <line> in the document.
    const leaderLine = container.querySelector(`.${styles.leaderLine}`) as SVGLineElement;
    const y1 = Number(leaderLine.getAttribute('y1'));
    const y2 = Number(leaderLine.getAttribute('y2'));
    expect(Math.abs(y1 - y2)).toBeGreaterThan(5);

    const annotation = screen.getByText(/in one partition/);
    expect(Number(annotation.getAttribute('y'))).toBeLessThan(y1);
  });

  it('left-anchors the annotation at the bar rather than centering it — the tallest bar always sits at its pane\'s left edge, so centering would bleed the text into the y-axis labels', () => {
    render(<PartitionHistogram panes={[{ label: 'run', partitionBytes: [4_400_000_000, 200_000, 100_000] }]} />);
    const annotation = screen.getByText(/in one partition/);
    expect(annotation.getAttribute('text-anchor')).toBe('start');
    // Left margin is 64px — the annotation must start at or after the bar's own x, not to its left.
    expect(Number(annotation.getAttribute('x'))).toBeGreaterThanOrEqual(64);
  });

  it('ships a visually-hidden data table with one row per partition across all panes', () => {
    const { container } = render(
      <PartitionHistogram
        panes={[
          { label: 'before', partitionBytes: [3, 2, 1] },
          { label: 'after', partitionBytes: [5, 4] },
        ]}
      />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(5);
  });

  it('sorts bars descending within each pane', () => {
    const { container } = render(<PartitionHistogram panes={[{ label: 'run', partitionBytes: [10, 50, 30] }]} />);
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) => row.textContent);
    expect(rows[0]).toContain('50');
    expect(rows[1]).toContain('30');
    expect(rows[2]).toContain('10');
  });
});
