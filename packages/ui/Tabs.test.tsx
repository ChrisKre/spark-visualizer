/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Tabs } from './Tabs';

afterEach(cleanup);

const TABS = [
  { id: 'diff', label: 'Diff', content: <p>diff content</p> },
  { id: 'config', label: 'Config', content: <p>config content</p> },
  { id: 'explain', label: 'EXPLAIN', content: <p>explain content</p> },
];

describe('Tabs', () => {
  it('shows the first tab active by default and hides the others', () => {
    render(<Tabs tabs={TABS} label="Code" />);
    expect(screen.getByText('diff content')).toBeInTheDocument();
    expect(screen.queryByText('config content')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Diff' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a tab switches the visible panel', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={TABS} label="Code" />);
    await user.click(screen.getByRole('tab', { name: 'Config' }));
    expect(screen.getByText('config content')).toBeInTheDocument();
    expect(screen.queryByText('diff content')).not.toBeInTheDocument();
  });

  it('ArrowRight/ArrowLeft moves selection and wraps around', async () => {
    const user = userEvent.setup();
    render(<Tabs tabs={TABS} label="Code" />);
    const diffTab = screen.getByRole('tab', { name: 'Diff' });
    diffTab.focus();

    await user.keyboard('{ArrowLeft}'); // wraps to the last tab
    expect(screen.getByRole('tab', { name: 'EXPLAIN' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'EXPLAIN' })).toHaveFocus();

    await user.keyboard('{ArrowRight}'); // wraps back to the first
    expect(screen.getByRole('tab', { name: 'Diff' })).toHaveAttribute('aria-selected', 'true');
  });

  it('only the active tab is keyboard-tabbable (roving tabindex)', () => {
    render(<Tabs tabs={TABS} label="Code" />);
    expect(screen.getByRole('tab', { name: 'Diff' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Config' })).toHaveAttribute('tabindex', '-1');
  });
});
