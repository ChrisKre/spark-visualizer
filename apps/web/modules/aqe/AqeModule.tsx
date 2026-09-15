'use client';

// SAS-060 (E7) — scaffold. Knobs land in SAS-061, the live run + plan tree in SAS-062.
import type { JSX } from 'react';
import { SETUP, TITLE } from './copy';
import styles from './AqeModule.module.css';

export function AqeModule(): JSX.Element {
  return (
    <article>
      <h1>{TITLE}</h1>
      <p className={styles.setup}>{SETUP}</p>
    </article>
  );
}
