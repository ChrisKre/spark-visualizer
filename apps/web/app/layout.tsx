import type { Metadata } from 'next';
import { themeScript } from '@sas/ui';
import { Nav } from './components/Nav';
import '@sas/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shuffle & Spill',
  description: 'A Spark shuffle, skew and AQE visualiser.',
};

// SAS-077 (E8) — cookieless analytics, gated on an env var so it only ever loads where a
// domain has actually been registered with Plausible (production), never in local dev or a PR
// preview. `apps/web/analytics/track.ts`'s calls are already safe no-ops without this script;
// this is what turns them on.
const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

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
        {plausibleDomain ? <script defer data-domain={plausibleDomain} src="https://plausible.io/js/script.js" /> : null}
      </head>
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
