import type { Metadata } from 'next';
import { themeScript } from '@sas/ui';
import { Nav } from './components/Nav';
import '@sas/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shuffle & Spill',
  description: 'A Spark shuffle, skew and AQE visualiser.',
};

// SAS-070 (E8) — the app shell every route renders inside: the nav plus the one landmark
// each page's own content fills. Modules add themselves to the nav via
// apps/web/modules/registry.ts, never by editing this file.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Pre-hydration theme read — see packages/ui/theme-script.ts. Must run before
            first paint, so it lives as an inline script rather than a client component. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
      </head>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
