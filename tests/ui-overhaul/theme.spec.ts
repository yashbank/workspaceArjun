import { test, expect, type Page } from '@playwright/test';

import { ROLES, storageStatePath } from '../../e2e/roles';
import { withDb } from './db';

/** R2 Theme Studio: apply, org-wide, revert, and Owner only. Leaves the default theme behind. */
const ACCESS_DENIED = 'You do not have access to this';
const TEAL = '#0f766e';
const brand = (page: Page) => page.evaluate(() => getComputedStyle(document.querySelector('.mis-light') ?? document.documentElement).getPropertyValue('--color-indigo-600').trim());
const storedTheme = () => withDb((q) => q<{ rule_value: string }>(`SELECT rule_value FROM mis_business_rules WHERE rule_key = 'ui.theme'`));
const auditCount = () => withDb(async (q) => (await q<{ n: number }>(`SELECT count(*)::int n FROM mis_audit_logs WHERE action = 'UPDATE_THEME'`))[0].n);

async function choose(page: Page, palette: string, font: string) {
  await page.goto('/mis/settings/theme');
  const main = page.locator('main:visible');
  await main.getByRole('button', { name: palette }).click();
  await main.getByRole('button', { name: font }).click();
  await expect(main.getByRole('button', { name: palette })).toHaveAttribute('aria-pressed', 'true');
  await main.getByRole('button', { name: 'Save theme' }).click();
  await expect(page.getByText('Theme saved for everyone.')).toBeVisible();
}

test.describe.serial('Owner', () => {
  test.use({ storageState: storageStatePath('OWNER') });

  test('apply reaches every role, then revert removes it', async ({ page, browser }) => {
    const audits = await auditCount();
    await page.goto('/mis/settings/theme');
    await expect(page.getByRole('button', { name: 'Save theme' })).toBeDisabled();
    const defaultBrand = await brand(page);
    expect(defaultBrand).not.toBe(TEAL);

    // Live preview before any save.
    await page.getByRole('button', { name: 'Teal' }).click();
    const preview = page.locator('main:visible').getByLabel('Live preview');
    await expect(preview).toHaveAttribute('style', new RegExp(`--color-indigo-600:\\s*${TEAL}`));
    expect(await brand(page), 'an unsaved choice stays in the preview').toBe(defaultBrand);

    await choose(page, 'Teal', 'Serif headings, Inter body');
    expect(await storedTheme()).toEqual([{ rule_value: JSON.stringify({ paletteId: 'teal', fontPairId: 'classic' }) }]);
    expect(await auditCount()).toBe(audits + 1);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Teal' })).toHaveAttribute('aria-pressed', 'true');
    expect(await brand(page)).toBe(TEAL);
    expect(await page.locator('main:visible h1').first().evaluate((h) => getComputedStyle(h).fontFamily), 'heading font applied').toContain('Georgia');

    // Printouts and badges read the same theme.
    await page.goto('/mis/print/badges');
    expect(await page.locator('.print-root').first().evaluate((r) => getComputedStyle(r).getPropertyValue('--color-indigo-600').trim())).toBe(TEAL);

    for (const role of ROLES) {
      const ctx = await browser.newContext({ storageState: storageStatePath(role) });
      const other = await ctx.newPage();
      await other.goto('/mis');
      expect(await brand(other), `${role} sees the org theme`).toBe(TEAL);
      await ctx.close();
    }

    await choose(page, 'Indigo (default)', 'Inter (default)');
    await page.reload();
    expect(await brand(page)).toBe(defaultBrand);
    expect(await storedTheme()).toEqual([{ rule_value: JSON.stringify({ paletteId: 'indigo', fontPairId: 'inter' }) }]);
    expect(await auditCount()).toBe(audits + 2);
  });

  test('the Owner settings screen links to it', async ({ page }) => {
    await page.goto('/mis/settings');
    await expect(page.locator('a[href="/mis/settings/theme"]').first()).toBeVisible();
  });
});

for (const role of ROLES.filter((r) => r !== 'OWNER')) {
  test(`${role} cannot open Theme Studio`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath(role) });
    const page = await ctx.newPage();
    await page.goto('/mis/settings/theme');
    await expect(page.getByText(ACCESS_DENIED).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save theme' })).toHaveCount(0);
    if (role === 'ADMIN') {
      await page.goto('/mis/settings');
      await expect(page.locator('a[href="/mis/settings/theme"]')).toHaveCount(0);
    }
    await ctx.close();
  });
}
