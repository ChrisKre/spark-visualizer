/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodePane } from './CodePane';

const PROPS = { diff: 'diff text', config: 'config text', explain: 'explain text' };

afterEach(cleanup);

describe('CodePane', () => {
  it('renders Diff, Config and EXPLAIN tabs, Diff active by default', () => {
    render(<CodePane {...PROPS} />);
    expect(screen.getByRole('tab', { name: 'Diff' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('diff text')).toBeInTheDocument();
  });

  it('switches content when a different tab is selected', async () => {
    const user = userEvent.setup();
    render(<CodePane {...PROPS} />);
    await user.click(screen.getByRole('tab', { name: 'EXPLAIN' }));
    expect(screen.getByText('explain text')).toBeInTheDocument();
  });

  it('every tab has a working copy button', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<CodePane {...PROPS} />);

    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('diff text');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
