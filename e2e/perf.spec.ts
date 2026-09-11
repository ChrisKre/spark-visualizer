import { expect, test } from '@playwright/test';

// Stub trace ahead of M1 — see apps/web/app/dev/perf-stub/page.tsx. Each value is the
// WORK duration of one rAF callback (time to clear + redraw), not the interval between
// consecutive callbacks — the interval is vsync-bound (~16.67ms at 60Hz regardless of how
// little work a frame does), so measuring it would make a "≤16ms" budget structurally
// unpassable. Collected in-page via performance.now() (simpler and more portable than
// parsing raw CDP trace events); swap for a CDP-trace-based measurement if finer-grained
// compositor timing is ever needed.
// TODO(SAS-050): repoint this test at /m/skew once the real task-timeline Gantt exists.
const FRAME_BUDGET_MS = 16;
const MIN_EXPECTED_FRAMES = 30;

test('perf stub: p95 frame time stays under the 16ms budget over ~10s', async ({ page }) => {
  test.setTimeout(20_000);
  await page.goto('/dev/perf-stub');
  await page.waitForFunction(
    () => (window as unknown as { __perfStubDone?: boolean }).__perfStubDone === true,
    undefined,
    { timeout: 15_000 },
  );

  const deltas = await page.evaluate(
    () => (window as unknown as { __perfStubFrameDeltas?: number[] }).__perfStubFrameDeltas ?? [],
  );
  expect(deltas.length).toBeGreaterThan(MIN_EXPECTED_FRAMES);

  const sorted = [...deltas].sort((a, b) => a - b);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index] ?? sorted[sorted.length - 1];

  expect(p95, `p95 frame time was ${p95?.toFixed(2)}ms over ${sorted.length} frames`).toBeLessThanOrEqual(
    FRAME_BUDGET_MS,
  );
});
