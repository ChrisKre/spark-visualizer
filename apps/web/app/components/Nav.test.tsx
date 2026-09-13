/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/m/skew',
}));

vi.mock('../../modules/registry', () => ({
  MODULE_REGISTRY: [{ id: 'skew', title: 'Data skew & salting', summary: 'skew module' }],
}));

afterEach(cleanup);

describe('Nav', () => {
  it('renders a link per registered module plus About, marking the active route', async () => {
    const { Nav } = await import('./Nav');
    render(<Nav />);

    const skewLink = screen.getByRole('link', { name: 'Data skew & salting' });
    expect(skewLink).toHaveAttribute('href', '/m/skew');
    expect(skewLink).toHaveAttribute('aria-current', 'page');

    const aboutLink = screen.getByRole('link', { name: 'About' });
    expect(aboutLink).toHaveAttribute('href', '/about');
    expect(aboutLink).not.toHaveAttribute('aria-current');
  });

  it('always renders a theme toggle', async () => {
    const { Nav } = await import('./Nav');
    render(<Nav />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
