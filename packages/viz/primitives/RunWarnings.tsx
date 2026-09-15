// SAS-076 (E8) — renders `RunResult.warnings` (packages/sim/model/metrics.ts's
// `collectWarnings`): oom/excessive-gc/idle-reducers/high-spill, each carrying its own honest,
// already-computed message. docs/APP_STATE.md §5: a simulated OOM "renders as a failed stage...
// copy explains which limit was crossed. Do not clamp to a plausible number." — this component
// is that copy surface; the sim already refuses to clamp, so nothing here invents a number.
//
// Plain `code`/`message` props, not `packages/sim`'s `Warning`/`WarningCode` types — viz may not
// import sim even for types (`.dependency-cruiser.cjs`'s `viz-only-imports-ui` rule), so this is
// a structural subset a caller's real `Warning[]` is assignable to as-is.
'use client';

import type { JSX } from 'react';
import styles from './RunWarnings.module.css';

export type RunWarningCode = 'oom' | 'excessive-gc' | 'idle-reducers' | 'high-spill';

export interface RunWarning {
  code: RunWarningCode;
  message: string;
}

export interface RunWarningsProps {
  warnings: RunWarning[];
  /** Shown once above the list — e.g. "Before" / "After" in compare mode. */
  label?: string;
}

// oom is the only code that means a stage genuinely failed; the rest are real but non-fatal
// observations about the run. Indirected through a `'crit' | 'warn'` key rather than the CSS
// module classes directly — `styles[key]` is typed `string | undefined` under
// `noUncheckedIndexedAccess` (css-modules.d.ts's index signature), so resolving it inside the
// template literal below (same pattern as Badge.tsx's `styles[provenance]`) keeps this a plain
// `Record<RunWarningCode, 'crit' | 'warn'>` with no `| undefined` to plumb through.
const SEVERITY: Record<RunWarningCode, 'crit' | 'warn'> = {
  oom: 'crit',
  'excessive-gc': 'warn',
  'idle-reducers': 'warn',
  'high-spill': 'warn',
};

export function RunWarnings({ warnings, label }: RunWarningsProps): JSX.Element | null {
  if (warnings.length === 0) return null;

  return (
    <div className={styles.list} role="status">
      {label ? <span className={styles.label}>{label}</span> : null}
      {warnings.map((warning, index) => (
        <p key={`${warning.code}-${index}`} className={`${styles.warning} ${styles[SEVERITY[warning.code]]}`}>
          {warning.message}
        </p>
      ))}
    </div>
  );
}
