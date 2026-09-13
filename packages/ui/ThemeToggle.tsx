'use client';

// SAS-070 (E8) — the toggle UI theme-script.ts's header comment names as landing here: it
// writes the same THEME_STORAGE_KEY the pre-hydration script reads, and flips
// `data-theme` on <html> immediately so the change is visible without a reload. Cycles
// through the three states tokens.css itself supports (docs/ARCHITECTURE.md's "three-state
// theming"): explicit light -> explicit dark -> unstamped system -> light ...
import { useEffect, useState, type JSX } from 'react';
import { THEME_STORAGE_KEY } from './theme-script';
import styles from './ThemeToggle.module.css';

type ThemeChoice = 'light' | 'dark' | 'system';

const NEXT: Record<ThemeChoice, ThemeChoice> = { light: 'dark', dark: 'system', system: 'light' };
const LABEL: Record<ThemeChoice, string> = { light: 'Light', dark: 'Dark', system: 'System' };

function readChoice(): ThemeChoice {
  if (typeof document === 'undefined') return 'system';
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' || attr === 'dark' ? attr : 'system';
}

function applyChoice(choice: ThemeChoice): void {
  if (choice === 'system') {
    document.documentElement.removeAttribute('data-theme');
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private browsing, disabled cookies); the in-memory
      // attribute change above still takes effect for this page load.
    }
  } else {
    document.documentElement.setAttribute('data-theme', choice);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {
      // Same as above — the attribute still applies even if persistence fails.
    }
  }
}

/** Reads its initial state from the DOM in an effect, not on first render, so server and
 *  client markup match — the pre-hydration script (theme-script.ts) is what may have already
 *  stamped `data-theme` before this component mounts. */
export function ThemeToggle(): JSX.Element {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    setChoice(readChoice());
  }, []);

  function handleClick(): void {
    const next = NEXT[choice];
    applyChoice(next);
    setChoice(next);
  }

  return (
    <button type="button" className={styles.toggle} onClick={handleClick} aria-label={`Theme: ${LABEL[choice]}. Activate to change.`}>
      {LABEL[choice]}
    </button>
  );
}
