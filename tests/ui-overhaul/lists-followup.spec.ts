import { test, expect } from '@playwright/test';

import { storageStatePath } from '../../e2e/roles';

/** R8 follow-up: inventory, store stock, store transactions and supplier invoices use the shared ListToolbar; theme.write is Owner only. */
const LISTS = [
  { path: '/mis/inventory', search: 'Search items…' },
  { path: '/mis/store/stock', search: 'Search by name, code or SKU…' },
  { path: '/mis/store/transactions', search: 'Search by txn no., item, ref…' },
  { path: '/mis/supplier-invoices', search: 'Search invoice, PO or supplier…' },
] as const;

test.describe('the four migrated lists, as the Owner', () => {
  test.use({ storageState: storageStatePath('OWNER') });

  for (const list of LISTS) {
    test(`${list.path}: shared toolbar, search in the URL, card/row toggle, clear`, async ({ page }) => {
      await page.goto(list.path);
      const main = page.locator('main:visible');
      const search = main.getByRole('searchbox', { name: list.search });
      await expect(search).toBeVisible();
      await expect(main.getByRole('group', { name: 'List layout' })).toHaveCount(1);

      await search.fill('zzz-no-such-row');
      await expect(page).toHaveURL(/q=zzz-no-such-row/);
      await expect(main.getByRole('link', { name: 'Clear filters' })).toBeVisible();
      await main.getByRole('link', { name: 'Clear filters' }).click();
      await expect(page).not.toHaveURL(/q=/);

      await main.getByRole('link', { name: 'Rows view' }).click();
      await expect(page).toHaveURL(/view=rows/);
      await main.getByRole('searchbox', { name: list.search }).fill('a');
      await expect(page).toHaveURL(/view=rows/);
      await expect(main.getByRole('link', { name: 'Rows view' })).toHaveAttribute('aria-current', 'true');
    });
  }

  test('transactions: the type filter is a URL param and Clear filters drops it', async ({ page }) => {
    await page.goto('/mis/store/transactions');
    const main = page.locator('main:visible');
    await main.getByLabel('Type').selectOption('IN');
    await expect(page).toHaveURL(/type=IN/);
    await main.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/type=/);
  });
});

test('theme.write is Owner only: the Admin gets no Theme Studio and no link to it', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: storageStatePath('ADMIN') });
  const page = await ctx.newPage();
  await page.goto('/mis/settings/theme');
  await expect(page.getByText('You do not have access to this').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save theme' })).toHaveCount(0);
  await page.goto('/mis/settings');
  await expect(page.locator('a[href="/mis/settings/theme"]')).toHaveCount(0);
  await ctx.close();
});
