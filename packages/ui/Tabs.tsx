'use client';

// SAS-056 (E6) / DESIGN_SYSTEM.md §5 — the generic tabbed container CodePane sits on top of.
// Presentational only, same as Scrubber/Knob: no store, no @sas/sim import. Follows the WAI-
// ARIA tabs pattern: role="tablist"/"tab"/"tabpanel", roving tabindex, and ArrowLeft/ArrowRight
// moving both focus and selection.
import { useId, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
  id: string;
  label: string;
  content: JSX.Element;
}

export interface TabsProps {
  tabs: TabItem[];
  label: string;
  /** Uncontrolled by default (first tab active); pass both to control it externally. */
  activeId?: string;
  onChange?: (id: string) => void;
}

export function Tabs({ tabs, label, activeId, onChange }: TabsProps): JSX.Element {
  const [internalActive, setInternalActive] = useState(tabs[0]?.id);
  const active = activeId ?? internalActive;
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function select(id: string): void {
    setInternalActive(id);
    onChange?.(id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + delta + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    if (!next) return;
    select(next.id);
    tabRefs.current[nextIndex]?.focus();
  }

  const activeTab = tabs.find((tab) => tab.id === active);

  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label={label} className={styles.tablist}>
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? styles.tabActive : styles.tab}
              onClick={() => select(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeTab ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${activeTab.id}`}
          aria-labelledby={`${baseId}-tab-${activeTab.id}`}
          className={styles.panel}
        >
          {activeTab.content}
        </div>
      ) : null}
    </div>
  );
}
