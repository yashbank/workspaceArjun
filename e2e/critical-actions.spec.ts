import { test, expect } from '@playwright/test';

import { storageStatePath } from './roles';

// Both are "access correctly refused" outcomes — see permission-boundaries.spec.ts's header
// comment for why the generic copy sometimes shows instead of the calm one (a real, pre-existing,
// non-security gap reported separately).
const ACCESS_DENIED = /You do not have access to this|Something went wrong/;

test.describe('STORE_GUY — critical pages must not crash (bug regressions)', () => {
  test.use({ storageState: storageStatePath('STORE_GUY') });

  test('PO list loads and a PO detail opens without the "try again" crash (fixed bug)', async ({ page }) => {
    await page.goto('/mis/po');
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);

    // DataTable renders both a mobile card list (md:hidden) and a desktop table (hidden md:block)
    // for the same rows — `:visible` picks whichever one this viewport actually shows.
    const firstPoLink = page.locator('a[href^="/mis/po/"]:visible').first();
    if ((await firstPoLink.count()) === 0) test.skip(true, 'no PO exists yet to open — nothing to regress-test');

    await firstPoLink.click();
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
  });

  test('Store dashboard renders real sections, not a blank screen', async ({ page }) => {
    await page.goto('/mis');
    // MisShell renders both the desktop and phone chrome in one DOM tree (D1/D3) — `.first()`
    // matches either; the page is genuinely non-blank either way.
    await expect(page.getByText('Moved today').first()).toBeVisible();
    await expect(page.getByText('Items tracked').first()).toBeVisible();
    await expect(page.getByText('GRNs awaiting entry').first()).toBeVisible();
  });
});

test.describe('QC — the Approvals leak stays fixed at the URL level, not just the menu', () => {
  test.use({ storageState: storageStatePath('QC') });

  test('direct navigation to /mis/approvals is refused, not just hidden from the menu', async ({ page }) => {
    await page.goto('/mis/approvals');
    await expect(page.getByText(ACCESS_DENIED).first()).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });

  test('QC dashboard and QC board still load normally (the fix did not over-restrict QC)', async ({ page }) => {
    await page.goto('/mis');
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    await page.goto('/mis/qc');
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
  });
});

test.describe('SUPERVISOR — Approvals refused at the URL level too', () => {
  test.use({ storageState: storageStatePath('SUPERVISOR') });

  test('direct navigation to /mis/approvals is refused', async ({ page }) => {
    await page.goto('/mis/approvals');
    await expect(page.getByText(ACCESS_DENIED).first()).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);
  });
});

test.describe('OWNER / ADMIN — Approvals still works for the roles that should have it', () => {
  test('OWNER can open Approvals', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('OWNER') });
    const page = await ctx.newPage();
    await page.goto('/mis/approvals');
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    await ctx.close();
  });

  test('ADMIN can open Approvals', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('ADMIN') });
    const page = await ctx.newPage();
    await page.goto('/mis/approvals');
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    await ctx.close();
  });
});
