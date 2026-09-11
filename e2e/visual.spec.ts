import { expect, test } from '@playwright/test';

// The three theme states from docs/DESIGN_SYSTEM.md §1 / docs/CONTRIBUTING.md's Definition
// of Done: explicit light, explicit dark, and unstamped system default. The unstamped case
// is the one that breaks — it's the only one not driven by an explicit `data-theme` write.
const THEME_STORAGE_KEY = 'sas-theme';

test.describe('visual regression: /', () => {
  test('explicit light', async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, 'light'],
    );
    await page.goto('/');
    await expect(page).toHaveScreenshot('home-light.png');
  });

  test('explicit dark', async ({ page }) => {
    await page.addInitScript(
      ([key, value]) => localStorage.setItem(key, value),
      [THEME_STORAGE_KEY, 'dark'],
    );
    await page.goto('/');
    await expect(page).toHaveScreenshot('home-dark.png');
  });

  test('unstamped system default (OS dark)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page).toHaveScreenshot('home-system-dark.png');
  });
});
