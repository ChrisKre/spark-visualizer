'use client';

// SAS-060/061 (E7) — scaffold + knob set. The live run + plan tree land in SAS-062.
import { useEffect, type JSX } from 'react';
import { useAppActions } from '../../store/useAppStore';
import { SETUP, TITLE } from './copy';
import { KnobPanel } from './KnobPanel';
import { KNOB_DEFAULTS } from './knobs';
import styles from './AqeModule.module.css';

export function AqeModule(): JSX.Element {
  const { setModule } = useAppActions();

  useEffect(() => {
    setModule('aqe', KNOB_DEFAULTS);
  }, [setModule]);

  return (
    <article>
      <h1>{TITLE}</h1>
      <p className={styles.setup}>{SETUP}</p>
      <KnobPanel />
    </article>
  );
}
