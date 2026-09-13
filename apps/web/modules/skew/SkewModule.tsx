'use client';

// SAS-051 (E6) — the knob panel replaces SAS-050's bare scaffold. The viz + metrics land in
// SAS-052, compare mode in SAS-053.
import { useEffect } from 'react';
import { ClockDriver } from '../../store/ClockDriver';
import { useAppActions } from '../../store/useAppStore';
import { useUrlSync } from '../../store/urlSync';
import { SETUP, TITLE } from './copy';
import { KnobPanel } from './KnobPanel';
import { KNOB_DEFAULTS } from './knobs';
import styles from './SkewModule.module.css';

export function SkewModule() {
  const { setModule } = useAppActions();

  useEffect(() => {
    setModule('skew', KNOB_DEFAULTS);
  }, [setModule]);

  useUrlSync(KNOB_DEFAULTS);

  return (
    <article>
      <ClockDriver />
      <h1>{TITLE}</h1>
      <p className={styles.setup}>{SETUP}</p>
      <KnobPanel />
    </article>
  );
}
