import { defineConfig, devices } from '@playwright/test';

// Serves the static export (apps/web/out) — no dev server, no backend, matching
// docs/adr/0006-no-backend.md. Run `pnpm build` before `pnpm exec playwright test` locally;
// CI's e2e job does this as a separate step.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Single worker in CI: the perf-trace suite measures frame timing and is sensitive to
  // resource contention from sibling test workers on a shared runner.
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm exec serve apps/web/out -l 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
