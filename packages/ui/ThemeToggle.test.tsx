/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from './theme-script';
import { ThemeToggle } from './ThemeToggle';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
});

describe('ThemeToggle', () => {
  it('starts reading the DOM state set by the pre-hydration script', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    render(<ThemeToggle />);
    expect(screen.getByRole('button')).toHaveTextContent('Dark');
  });

  it('cycles light -> dark -> system -> light, writing/clearing localStorage each step', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const button = screen.getByRole('button');

    // Unstamped DOM reads as 'system'.
    expect(button).toHaveTextContent('System');

    await user.click(button);
    expect(button).toHaveTextContent('Light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    await user.click(button);
    expect(button).toHaveTextContent('Dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await user.click(button);
    expect(button).toHaveTextContent('System');
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
