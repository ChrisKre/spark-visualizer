import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Grows with E6/E8 as /m/[moduleId] routes land; only "/" exists at E1 time.
const ROUTES = ['/'];

for (const route of ROUTES) {
  test(`a11y: ${route} has no serious or critical violations`, async ({ page }) => {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrCritical = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    );
    expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
  });
}
