'use client';

// SAS-077 (E8) — docs/APP_STATE.md §6 names "permalink copied" as one of the four analytics
// events to track, but no affordance to copy the permalink existed anywhere (the URL already
// round-trips live via SAS-074's history.replaceState, just with nothing to copy it from). This
// is that affordance. Clipboard access, not analytics, lives here — `onCopy` fires only after a
// successful write, and the caller (apps/web) decides what to do with it (the `track()` call),
// same split as ThemeToggle owning DOM/localStorage while a module owns nothing about theme.
import { useState, type JSX } from 'react';
import styles from './CopyLinkButton.module.css';

export interface CopyLinkButtonProps {
  /** Called only after `navigator.clipboard.writeText` genuinely succeeds. */
  onCopy: () => void;
}

const RESET_DELAY_MS = 1500;

export function CopyLinkButton({ onCopy }: CopyLinkButtonProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function handleClick(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Clipboard access can fail (permissions, insecure context, unsupported browser) — the
      // URL is still visible in the address bar as a fallback, so fail silently rather than
      // show an error for something this low-stakes.
      return;
    }
    onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), RESET_DELAY_MS);
  }

  return (
    <button type="button" className={styles.button} onClick={handleClick}>
      {copied ? 'Copied!' : 'Copy link'}
    </button>
  );
}
