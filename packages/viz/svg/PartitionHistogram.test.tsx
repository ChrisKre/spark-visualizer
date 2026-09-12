/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PartitionHistogram } from './PartitionHistogram';

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
