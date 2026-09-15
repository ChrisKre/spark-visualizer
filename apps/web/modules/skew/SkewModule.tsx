'use client';

// SAS-050 (E6) — module scaffold for /m/skew. Knobs land in SAS-051, the viz + metrics in
// SAS-052, compare mode in SAS-053. This ticket only proves the route composes: heading, the
// module's setup copy, and the clock mounted (idle until a run gives it a duration).
import { ClockDriver } from '../../store/ClockDriver';
import { SETUP, TITLE } from './copy';
import styles from './SkewModule.module.css';

export function SkewModule() {
  return (
    <article>
      <ClockDriver />
      <h1>{TITLE}</h1>
      <p className={styles.setup}>{SETUP}</p>
    </article>
  );
}
