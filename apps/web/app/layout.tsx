import type { Metadata } from 'next';
import { themeScript } from '@sas/ui';
import '@sas/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shuffle & Spill',
  description: 'A Spark shuffle, skew and AQE visualiser.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Pre-hydration theme read — see packages/ui/theme-script.ts. Must run before
            first paint, so it lives as an inline script rather than a client component. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
