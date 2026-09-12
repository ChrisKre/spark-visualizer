/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { render } from '@testing-library/react';
import type { JSX } from 'react';
import { describe, expect, it } from 'vitest';
import { Axis } from './Axis';
import { createBandScale, createLinearScale } from './scales';

function renderAxisSvg(children: JSX.Element) {
  const { container } = render(<svg>{children}</svg>);
  return container.querySelector('svg') as SVGSVGElement;
}

describe('Axis', () => {
  it('always ticks the domain max for a linear scale even off the default tick step', () => {
    const scale = createLinearScale([0, 37], [0, 100]);
    const svg = renderAxisSvg(<Axis orientation="bottom" scale={scale} />);
    const labels = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(labels).toContain('37');
  });

  it('renders one tick per category for a band scale', () => {
    const scale = createBandScale(['a', 'b', 'c'], [0, 300]);
    const svg = renderAxisSvg(<Axis orientation="left" scale={scale} />);
    const labels = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(labels).toEqual(['a', 'b', 'c']);
  });

  it('applies a custom tick formatter', () => {
    const scale = createLinearScale([0, 100], [0, 100]);
    const svg = renderAxisSvg(<Axis orientation="bottom" scale={scale} tickFormat={(v) => `${v}%`} />);
    const labels = Array.from(svg.querySelectorAll('text')).map((t) => t.textContent);
    expect(labels.every((l) => l?.endsWith('%'))).toBe(true);
  });

  it('renders an axis label when provided', () => {
    const scale = createLinearScale([0, 10], [0, 100]);
    const svg = renderAxisSvg(<Axis orientation="left" scale={scale} label="Bytes" />);
    expect(svg.textContent).toContain('Bytes');
  });
});
