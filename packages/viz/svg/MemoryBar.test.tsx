/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryBar } from './MemoryBar';
import styles from './MemoryBar.module.css';

afterEach(cleanup);

describe('MemoryBar', () => {
  it('sizes the execution and storage segments proportionally to bytes/capacity', () => {
    const { container } = render(
      <MemoryBar
        executionMemoryBytes={500}
        storageMemoryBytes={0}
        executionCapacityBytes={1000}
        storageCapacityBytes={1000}
        spilledBytes={0}
      />,
    );
    const executionUsed = container.querySelector(`.${styles.executionUsed}`) as SVGRectElement;
    const executionCapacity = container.querySelector(`.${styles.executionCapacity}`) as SVGRectElement;
    // 500 used out of a 1000+1000=2000 total capacity -> half of the execution capacity's own
    // share (executionCapacity itself is 1000/2000 = half the bar; used is half of that again).
    const usedWidth = Number(executionUsed.getAttribute('width'));
    const capacityWidth = Number(executionCapacity.getAttribute('width'));
    expect(usedWidth).toBeCloseTo(capacityWidth / 2, 5);
  });

  it('marks an over-capacity execution segment as OOM with a text label, not color alone', () => {
    const { container } = render(
      <MemoryBar
        executionMemoryBytes={1500}
        storageMemoryBytes={0}
        executionCapacityBytes={1000}
        storageCapacityBytes={1000}
        spilledBytes={0}
      />,
    );
    expect(screen.getByText('OOM')).toBeInTheDocument();
    expect(container.querySelector(`.${styles.executionOom}`)).not.toBeNull();
    expect(container.querySelector(`.${styles.executionUsed}`)).toBeNull();
  });

  it('clamps the used-execution segment width at capacity even when memory exceeds it', () => {
    const { container } = render(
      <MemoryBar
        executionMemoryBytes={5000}
        storageMemoryBytes={0}
        executionCapacityBytes={1000}
        storageCapacityBytes={1000}
        spilledBytes={0}
      />,
    );
    const executionOom = container.querySelector(`.${styles.executionOom}`) as SVGRectElement;
    const executionCapacity = container.querySelector(`.${styles.executionCapacity}`) as SVGRectElement;
    expect(Number(executionOom.getAttribute('width'))).toBeCloseTo(Number(executionCapacity.getAttribute('width')), 5);
  });

  it('renders a spill marker with both a pattern fill and a text label when spilled', () => {
    const { container } = render(
      <MemoryBar
        executionMemoryBytes={500}
        storageMemoryBytes={500}
        executionCapacityBytes={1000}
        storageCapacityBytes={1000}
        spilledBytes={2048}
      />,
    );
    expect(screen.getByText(/Spilled to disk: 2\.00 KiB/)).toBeInTheDocument();
    const spillBar = container.querySelector(`.${styles.spillBar}`);
    expect(spillBar).not.toBeNull();
    expect(spillBar?.getAttribute('fill')).toMatch(/^url\(#/);
  });

  it('omits the spill marker entirely when nothing spilled', () => {
    const { container } = render(
      <MemoryBar
        executionMemoryBytes={500}
        storageMemoryBytes={500}
        executionCapacityBytes={1000}
        storageCapacityBytes={1000}
        spilledBytes={0}
      />,
    );
    expect(container.querySelector(`.${styles.spillBar}`)).toBeNull();
    expect(screen.queryByText(/Spilled to disk/)).not.toBeInTheDocument();
  });
});
