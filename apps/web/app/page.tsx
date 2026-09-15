import type { Metadata } from 'next';
import Link from 'next/link';
import type { JSX } from 'react';
import { MODULE_REGISTRY } from '../modules/registry';
import styles from './page.module.css';

// SAS-075 (E8) — replaces the E1 boundary-proof scaffold. Module cards read
// apps/web/modules/registry.ts's MODULE_REGISTRY, the same source Nav.tsx reads, so a future
// module (M3+) appears here the moment it's registered — no landing-page edit required.
export const metadata: Metadata = {
  title: 'Shuffle & Spill',
  description: 'A Spark shuffle, skew and AQE visualiser.',
};

const FRAMING =
  'Start with skew: one hot key holds up 200 tasks while the other 199 finish in the first ' +
  'nine seconds. Every module here runs on the same engine — real partition sizing, real task ' +
  'scheduling, the same metric ribbon — so once the first one makes sense, the rest are just ' +
  'new questions asked of it.';

export default function HomePage(): JSX.Element {
  return (
    <main className={styles.main}>
      <section className={styles.hero}>
        <h1>Shuffle &amp; Spill</h1>
        <p className={styles.pitch}>A Spark shuffle, skew and AQE visualiser.</p>
        <p className={styles.framing}>{FRAMING}</p>
      </section>

      <ul className={styles.modules}>
        {MODULE_REGISTRY.map((module) => (
          <li key={module.id}>
            <Link href={`/m/${module.id}`} className={styles.moduleCard}>
              <h2>{module.title}</h2>
              <p>{module.summary}</p>
            </Link>
          </li>
        ))}
      </ul>

      <p className={styles.aboutLink}>
        <Link href="/about">About the data</Link>
      </p>
    </main>
  );
}
