/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyLinkButton } from './CopyLinkButton';

// `@testing-library/user-event`'s `setup()` installs its own Clipboard stub on
// `navigator.clipboard`, unconditionally overwriting anything already there — so this must run
// *after* `userEvent.setup()`, not before, or userEvent's stub wins instead of ours.
function stubClipboard(writeText: (text: string) => Promise<void>): ReturnType<typeof vi.fn> {
  const spy = vi.fn(writeText);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: spy }, configurable: true });
  return spy;
}

afterEach(cleanup);

describe('CopyLinkButton', () => {
  it('copies the current URL, calls onCopy, and shows a transient confirmation', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard(async () => undefined);
    const onCopy = vi.fn();
    render(<CopyLinkButton onCopy={onCopy} />);

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument(), { timeout: 3000 });
  });

  it('does not call onCopy or show a confirmation when clipboard access fails', async () => {
    const user = userEvent.setup();
    stubClipboard(async () => {
      throw new Error('denied');
    });
    const onCopy = vi.fn();
    render(<CopyLinkButton onCopy={onCopy} />);

    await user.click(screen.getByRole('button', { name: 'Copy link' }));

    expect(onCopy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });
});
