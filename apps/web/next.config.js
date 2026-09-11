// docs/adr/0006-no-backend.md: static files on a CDN, forever. `output: 'export'` turns
// that decision into a build-time error rather than a discipline — no API routes, no
// middleware, no ISR, no server component that touches request context.
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // No image-optimization server exists under output:'export'.
  images: { unoptimized: true },
  reactStrictMode: true,
  // Workspace packages ship raw .ts/.tsx with no build step of their own — Next transpiles
  // them itself. See docs/ARCHITECTURE.md §2 for the package list.
  transpilePackages: ['@sas/ui', '@sas/viz', '@sas/sim', '@sas/fixtures'],
};

// ANALYZE=true pnpm build → writes an HTML treemap of the client bundle under .next/analyze
// for human inspection. tools/check-bundle-budget.mjs enforces the actual 160kB gz pass/fail
// gate (SAS-007) against Next's own "First Load JS" build output, which is the number
// docs/CONTRIBUTING.md's performance gate is defined against.
module.exports = withBundleAnalyzer(nextConfig);
