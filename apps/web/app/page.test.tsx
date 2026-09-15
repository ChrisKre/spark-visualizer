/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../modules/registry', () => ({
  MODULE_REGISTRY: [
    { id: 'skew', title: 'Data skew & salting', summary: 'one bar dwarfs 199 others' },
    { id: 'aqe', title: 'Adaptive Query Execution', summary: 'the DAG rewrites itself' },
  ],
}));

afterEach(cleanup);

describe('HomePage', () => {
  it('renders the site name and pitch', async () => {
    const HomePage = (await import('./page')).default;
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Shuffle & Spill' })).toBeInTheDocument();
    expect(screen.getByText('A Spark shuffle, skew and AQE visualiser.')).toBeInTheDocument();
  });

  it('renders one card per registered module, linking to its route', async () => {
    const HomePage = (await import('./page')).default;
    render(<HomePage />);

    const skewLink = screen.getByRole('link', { name: /Data skew & salting/ });
    expect(skewLink).toHaveAttribute('href', '/m/skew');
    expect(screen.getByText('one bar dwarfs 199 others')).toBeInTheDocument();

    const aqeLink = screen.getByRole('link', { name: /Adaptive Query Execution/ });
    expect(aqeLink).toHaveAttribute('href', '/m/aqe');
  });

  it('links to the about page', async () => {
    const HomePage = (await import('./page')).default;
    render(<HomePage />);
    expect(screen.getByRole('link', { name: 'About the data' })).toHaveAttribute('href', '/about');
  });
});
