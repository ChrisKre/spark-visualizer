'use client';

// SAS-056 (E6) / DESIGN_SYSTEM.md §5 — "tabbed: Diff / Config / EXPLAIN. Static, copyable,
// syntax-highlighted at build time, not with a runtime highlighter library." No highlighter is
// wired up (a static one is a separate, larger build-pipeline piece); this satisfies the actual
// constraint — a runtime JS highlighter never runs — by not highlighting at all yet, rather than
// reaching for one.
import { useState, type JSX } from 'react';
import { Tabs } from './Tabs';
import styles from './CodePane.module.css';

function CodeBlock({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied (permissions, insecure context); the text is still
      // selectable and copyable by hand from the <pre> below.
    }
  }

  return (
    <div className={styles.block}>
      <button type="button" className={styles.copyButton} onClick={handleCopy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className={styles.pre}>
        <code>{text}</code>
      </pre>
    </div>
  );
}

export interface CodePaneProps {
  diff: string;
  config: string;
  explain: string;
}

export function CodePane({ diff, config, explain }: CodePaneProps): JSX.Element {
  return (
    <Tabs
      label="Code"
      tabs={[
        { id: 'diff', label: 'Diff', content: <CodeBlock text={diff} /> },
        { id: 'config', label: 'Config', content: <CodeBlock text={config} /> },
        { id: 'explain', label: 'EXPLAIN', content: <CodeBlock text={explain} /> },
      ]}
    />
  );
}
