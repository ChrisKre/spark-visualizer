'use client';

// SAS-070 (E8) — the app shell's nav. Reads apps/web/modules/registry.ts so a new module
// only ever needs one registration, never a nav edit. usePathname needs a client component;
// everything else in the shell can stay a server component.
import { ThemeToggle } from '@sas/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { JSX } from 'react';
import { MODULE_REGISTRY } from '../../modules/registry';
import styles from './Nav.module.css';

export function Nav(): JSX.Element {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <nav className={styles.nav} aria-label="Primary">
        <Link href="/" className={styles.brand}>
          Shuffle &amp; Spill
        </Link>
        <ul className={styles.links}>
          {MODULE_REGISTRY.map((module) => {
            const href = `/m/${module.id}`;
            const active = pathname === href;
            return (
              <li key={module.id}>
                <Link href={href} className={styles.link} aria-current={active ? 'page' : undefined}>
                  {module.title}
                </Link>
              </li>
            );
          })}
          <li>
            <Link href="/about" className={styles.link} aria-current={pathname === '/about' ? 'page' : undefined}>
              About
            </Link>
          </li>
        </ul>
      </nav>
      <ThemeToggle />
    </header>
  );
}
