import { test, expect } from '@playwright/test';

import { storageStatePath } from './roles';

/**
 * R2 Round 7 (R2-374..379) — read-only checks on the real site. Safe against the tester's data:
 * nothing is saved, rejected or paid.
 */
for (const vp of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844 }]) {
  test.describe(`round 7 @ ${vp.name}`, () => {
    test.use({ storageState: storageStatePath('OWNER'), viewport: { width: vp.width, height: vp.height } });

    test('R2-376: supplier invoices KPI strip has 4 cards', async ({ page }) => {
      await page.goto('/mis/supplier-invoices');
      await expect(page.getByTestId('invoice-kpi-card')).toHaveCount(4);
    });

    test('R2-377: Export CSV control is present', async ({ page }) => {
      await page.goto('/mis/supplier-invoices');
      await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible();
    });

    test('R2-375: no page-wide horizontal overflow and no text inputs inside table cells', async ({ page }) => {
      await page.goto('/mis/supplier-invoices');
      await expect(page.getByTestId('invoice-kpi-card').first()).toBeVisible();
      expect(await page.locator('table td input').count()).toBe(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test('R2-378: BOM list shows a BOM # column and searches by it', async ({ page }) => {
      await page.goto('/mis/bom');
      await expect(page.getByPlaceholder(/BOM #/)).toBeVisible();
      if (vp.name === 'desktop') await expect(page.getByRole('columnheader', { name: 'BOM #' })).toBeVisible();
    });
  });
}
