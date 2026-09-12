// Driven only by `RunResult.provenance` (ADR-0003: "MEASURED must never be shown for a
// modelled result. This is enforced by construction — the badge reads provenance, and
// provenance is set by the resolver, not by a component.")
//
// There is deliberately no `label`/`text` prop: the display string comes from the internal
// LABEL map below, keyed only by `provenance`. A caller cannot show "MEASURED" independent of
// passing `provenance="measured"` — TS's excess-property checking on the JSX literal itself
// already rejects any stray prop this component doesn't declare.
import type { JSX } from 'react';
import styles from './Badge.module.css';

export type Provenance = 'measured' | 'modeled' | 'executed';

export interface BadgeProps {
  provenance: Provenance;
}

const LABEL: Record<Provenance, string> = {
  measured: 'MEASURED',
  modeled: 'MODELED',
  executed: 'EXECUTED',
};

export function Badge({ provenance }: BadgeProps): JSX.Element {
  return <span className={`${styles.badge} ${styles[provenance]}`}>{LABEL[provenance]}</span>;
}
