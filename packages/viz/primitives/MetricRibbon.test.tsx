/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MetricRibbon } from './MetricRibbon';
import type { MetricDef } from './metricDefs';
import styles from './MetricRibbon.module.css';

afterEach(cleanup);

describe('MetricRibbon — single mode', () => {
  it('renders all six metrics in order', () => {
    const { container } = render(
      <MetricRibbon
        mode="single"
        values={{
          wallClockMs: 48_200,
          cpuSeconds: 12,
          stragglerRatio: 1.8,
          shuffleReadBytes: 2_097_152,
          diskSpilledBytes: 0,
          gcPercent: 3.4,
        }}
      />,
    );
    const labels = Array.from(container.querySelectorAll('[role="cell"]')).map((cell) =>
      cell.querySelector('div')?.textContent,
    );
    expect(labels).toEqual(['Wall clock', 'CPU-s', 'Straggler ratio', 'Shuffle read', 'Disk spilled', 'GC %']);
    expect(screen.getByText('48.2 s')).toBeInTheDocument();
  });

  it('shows a placeholder for a missing metric rather than crashing', () => {
    render(<MetricRibbon mode="single" values={{ wallClockMs: 1000 }} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('MetricRibbon — compare mode', () => {
  it('shows before, after, and a signed delta', () => {
    render(
      <MetricRibbon
        mode="compare"
        before={{ wallClockMs: 100_000 }}
        after={{ wallClockMs: 40_000 }}
      />,
    );
    expect(screen.getByText('1m 40s')).toBeInTheDocument();
    expect(screen.getByText('40.0 s')).toBeInTheDocument();
    expect(screen.getByText(/−60.0 s/)).toBeInTheDocument();
  });

  it('colors an improving delta (lower is better, value went down) as better', () => {
    const { container } = render(<MetricRibbon mode="compare" before={{ gcPercent: 20 }} after={{ gcPercent: 5 }} />);
    const delta = container.querySelector(`.${styles.better}`);
    expect(delta).not.toBeNull();
    expect(delta?.textContent).toContain('15.0%');
  });

  it('colors a worsening delta (lower is better, value went up) as worse', () => {
    const { container } = render(<MetricRibbon mode="compare" before={{ gcPercent: 5 }} after={{ gcPercent: 20 }} />);
    expect(container.querySelector(`.${styles.worse}`)).not.toBeNull();
  });

  it('respects a custom lowerIsBetter=false metric', () => {
    const throughputMetric: MetricDef = {
      key: 'wallClockMs',
      label: 'Throughput',
      format: (v) => `${v}`,
      lowerIsBetter: false,
    };
    const { container } = render(
      <MetricRibbon
        mode="compare"
        before={{ wallClockMs: 10 }}
        after={{ wallClockMs: 20 }}
        metrics={[throughputMetric]}
      />,
    );
    // Higher is better here, and the value went up — that's an improvement, not a regression.
    expect(container.querySelector(`.${styles.better}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.worse}`)).toBeNull();
  });
});

describe('MetricRibbon — narrow-width exemption', () => {
  it('exempts only cpuSeconds from the narrow-width collapse class', () => {
    const { container } = render(
      <MetricRibbon mode="single" values={{ wallClockMs: 1000, cpuSeconds: 1 }} />,
    );
    const cells = Array.from(container.querySelectorAll('[role="cell"]'));
    const cpuCell = cells.find((cell) => cell.textContent?.includes('CPU-s'));
    const wallClockCell = cells.find((cell) => cell.textContent?.includes('Wall clock'));
    expect(cpuCell?.className).toContain(styles.alwaysVisible);
    expect(wallClockCell?.className).toContain(styles.collapsible);
  });
});
