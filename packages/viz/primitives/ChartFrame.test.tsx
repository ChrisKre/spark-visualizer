/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChartFrame } from './ChartFrame';

// Vitest's global `afterEach` isn't populated (test.globals is off, matching the rest of the
// repo's config), so @testing-library/react's automatic cleanup-detection doesn't fire. Do it
// explicitly wherever a test queries the whole document (`screen.*`) rather than a scoped
// container, so renders from earlier tests in this file don't leak into later assertions.
afterEach(cleanup);

describe('ChartFrame', () => {
  it('renders an svg with the given viewBox and an accessible title', () => {
    render(
      <ChartFrame viewBoxWidth={400} viewBoxHeight={200} title="Partition sizes">
        <rect x={0} y={0} width={10} height={10} fill="var(--accent)" />
      </ChartFrame>,
    );
    const svg = screen.getByRole('img', { name: 'Partition sizes' });
    expect(svg).toHaveAttribute('viewBox', '0 0 400 200');
  });

  it('renders an optional desc and labels the svg by both title and desc', () => {
    render(
      <ChartFrame viewBoxWidth={100} viewBoxHeight={100} title="A" desc="Longer description">
        <g />
      </ChartFrame>,
    );
    const svg = screen.getByRole('img');
    const labelledBy = svg.getAttribute('aria-labelledby');
    expect(labelledBy?.split(' ')).toHaveLength(2);
    expect(screen.getByText('Longer description').tagName.toLowerCase()).toBe('desc');
  });

  it('wraps the svg in its own horizontal-scroll container', () => {
    const { container } = render(
      <ChartFrame viewBoxWidth={100} viewBoxHeight={100} title="A">
        <g />
      </ChartFrame>,
    );
    const wrapper = container.firstElementChild;
    expect(wrapper?.querySelector('svg')).not.toBeNull();
  });
});
