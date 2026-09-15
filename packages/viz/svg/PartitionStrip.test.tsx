/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PartitionStrip } from './PartitionStrip';

afterEach(cleanup);

describe('PartitionStrip', () => {
  it('renders one cell per partition, in each pane', () => {
    const { container } = render(
      <PartitionStrip
        before={{ label: 'Before', partitionBytes: [10, 20, 30, 40] }}
        after={{ label: 'After', partitionBytes: [60, 40] }}
      />,
    );
    expect(container.querySelectorAll('rect')).toHaveLength(6);
  });

  it('does not sort — cells render in original partition order', () => {
    const { container } = render(
      <PartitionStrip
        before={{ label: 'Before', partitionBytes: [100, 10, 50] }}
        after={{ label: 'After', partitionBytes: [160] }}
      />,
    );
    const rects = Array.from(container.querySelectorAll('rect'));
    // 3 before-cells then 1 after-cell, left to right — widths track the ORIGINAL order
    // (100, 10, 50), not sorted descending/ascending.
    const widths = rects.slice(0, 3).map((r) => Number(r.getAttribute('width')));
    expect(widths[0]).toBeGreaterThan(widths[1] ?? 0);
    expect(widths[2]).toBeGreaterThan(widths[1] ?? 0);
  });

  it('gives both panes the same total row width — the same total bytes span the full row', () => {
    const { container } = render(
      <PartitionStrip
        before={{ label: 'Before', partitionBytes: [10, 10, 10, 10] }}
        after={{ label: 'After', partitionBytes: [20, 20] }}
      />,
    );
    const rects = Array.from(container.querySelectorAll('rect'));
    const beforeSpan = rects.slice(0, 4).reduce((sum, r) => sum + Number(r.getAttribute('width')), 0);
    const afterSpan = rects.slice(4).reduce((sum, r) => sum + Number(r.getAttribute('width')), 0);
    expect(beforeSpan).toBeCloseTo(afterSpan, 5);
  });

  it('labels each row with its pane name and partition count', () => {
    render(
      <PartitionStrip
        before={{ label: 'Before', partitionBytes: [1, 1, 1] }}
        after={{ label: 'After', partitionBytes: [1] }}
      />,
    );
    expect(screen.getByText('Before (3)')).toBeInTheDocument();
    expect(screen.getByText('After (1)')).toBeInTheDocument();
  });

  it('ships a visually-hidden data table with one row per partition across both panes', () => {
    const { container } = render(
      <PartitionStrip
        before={{ label: 'Before', partitionBytes: [1, 2, 3] }}
        after={{ label: 'After', partitionBytes: [4, 2] }}
      />,
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
  });
});
