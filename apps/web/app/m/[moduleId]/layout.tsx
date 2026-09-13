import type { JSX, ReactNode } from 'react';
import styles from './moduleShell.module.css';

// SAS-070 (E8) — the generic wrapper every module route renders inside. Modules bring their
// own composition (apps/web/modules/<id>/) below this; this layer owns only the shared
// spacing/width, nothing module-specific.
export default function ModuleLayout({ children }: { children: ReactNode }): JSX.Element {
  return <main className={styles.shell}>{children}</main>;
}
