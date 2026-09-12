import type { Metadata } from 'next';
import styles from './about.module.css';

// SAS-034 — dataset attribution only (scope per BACKLOG.md). The fuller "three-layer model,
// honesty statement, attribution" page is SAS-083 (E9, depends on this ticket) and will extend
// this same route — the .section boundary below is deliberately left for it to add to, not
// restructure. Copy sourced from docs/DATA_PIPELINE.md §6's licensing table.
export const metadata: Metadata = {
  title: 'About the data — Shuffle & Spill',
  description: 'Dataset attribution and licensing for Shuffle & Spill.',
};

export default function AboutPage() {
  return (
    <main className={styles.main}>
      <h1>About the data</h1>
      <section aria-labelledby="tlc-heading" className={styles.section}>
        <h2 id="tlc-heading">NYC Taxi &amp; Limousine Commission trip records</h2>
        <p>
          Trip records driving this site&apos;s charts and query demos come from the{' '}
          <a href="https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page">
            NYC Taxi &amp; Limousine Commission
          </a>
          , via NYC Open Data, covering January–June 2019. This dataset is in the public domain.
        </p>
        <p className={styles.disclaimer}>
          Shuffle &amp; Spill is not affiliated with, and does not imply endorsement by, the TLC or
          the City of New York. Raw source data is not redistributed here — only derived aggregates
          (<code>trips_hourly.parquet</code>, <code>zones.parquet</code>) and a stratified sample
          (<code>trips_sample.parquet</code>) that preserves the pickup-zone distribution are
          committed to this repository. See{' '}
          <a href="https://github.com/ChrisKre/spark-visualizer/blob/main/docs/DATA_PIPELINE.md">
            docs/DATA_PIPELINE.md
          </a>{' '}
          for the full build pipeline and licensing notes.
        </p>
      </section>
    </main>
  );
}
