import { test, expect } from '@playwright/test';

import { EXPECTED_NAV, ROLES, storageStatePath } from '../../e2e/roles';

/** R2 list consistency: one toolbar, one pager, one empty state, on every migrated list and for every role that has it. */
/** The shell keeps the phone and desktop chrome in one DOM, so a screen is rendered twice: only the visible copy counts. */
const LISTS = [
  { id: 'orders', path: '/mis/orders', search: 'Search orders…', toggle: true, hit: 'ORD-7' },
  { id: 'bom', path: '/mis/bom', search: 'Search orders or BOM #…', toggle: true, hit: 'ORD-7' },
  { id: 'po', path: '/mis/po', search: 'Search POs…', toggle: true, hit: null },
  { id: 'grn', path: '/mis/grn', search: 'Search GRNs…', toggle: true, hit: null },
  { id: 'suppliers', path: '/mis/suppliers', search: 'Search suppliers…', toggle: true, hit: 'Fake Supplier 7' },
  { id: 'employees', path: '/mis/employees', search: 'Search employees…', toggle: true, hit: 'Fake Worker 17' },
  { id: 'production', path: '/mis/production', search: 'Search orders…', toggle: false, hit: 'ORD-7' },
  { id: 'quality', path: '/mis/qc', search: 'Search orders…', toggle: false, hit: 'ORD-7' },
  { id: 'audit', path: '/mis/audit', search: 'Search actions, actors…', toggle: false, hit: null },
] as const;

test.describe('every list, as the Owner', () => {
  test.use({ storageState: storageStatePath('OWNER') });

  for (const list of LISTS) {
    test(`${list.path}: toolbar, pager, search, empty state, clear`, async ({ page }) => {
      await page.goto(list.path);
      const main = page.locator('main:visible');
      const search = main.getByRole('searchbox', { name: list.search });
      await expect(search).toBeVisible();
      await expect(main.getByRole('group', { name: 'List layout' })).toHaveCount(list.toggle ? 1 : 0);

      // Pager: 10 a page, and page 2 really is another page.
      const pager = main.getByTestId('pagination-range');
      await expect(pager).toContainText(/Page 1 of [2-9]/);
      const first = await main.innerText();
      await main.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: '2', exact: true }).click();
      await expect(page).toHaveURL(/page=2/);
      await expect(pager).toContainText(/Page 2 of/);
      expect(await main.innerText()).not.toBe(first);

      // A search that hits nothing resets the page and shows an empty state, then Clear brings the list back.
      await search.fill('zzz-no-such-row');
      await expect(page).toHaveURL(/q=zzz-no-such-row/);
      await expect(page).not.toHaveURL(/page=2/);
      await expect(main.getByRole('link', { name: 'Clear filters' })).toBeVisible();
      await expect(main.locator('table tbody tr')).toHaveCount(0);
      await main.getByRole('link', { name: 'Clear filters' }).click();
      await expect(page).not.toHaveURL(/q=/);
      await expect(pager).toContainText(/Page 1 of [2-9]/);

      if (list.hit) {
        await main.getByRole('searchbox', { name: list.search }).fill(list.hit);
        await expect(page).toHaveURL(/q=/);
        await expect(main).toContainText(list.hit);
        await expect(pager).toContainText(/Page 1 of 1/);
      }
    });

    if (list.toggle) {
      test(`${list.path}: cards and rows toggle, and the choice survives a search`, async ({ page }) => {
        await page.goto(list.path);
        const main = page.locator('main:visible');
        const cards = main.getByRole('link', { name: 'Cards view' });
        const rows = main.getByRole('link', { name: 'Rows view' });
        await rows.click();
        await expect(page).toHaveURL(/view=rows/);
        await expect(rows).toHaveAttribute('aria-current', 'true');
        await expect(main.locator('table:visible')).toHaveCount(1);
        await cards.click();
        await expect(page).toHaveURL(/view=cards/);
        await expect(cards).toHaveAttribute('aria-current', 'true');
        await expect(main.locator('table:visible')).toHaveCount(0);
        await main.getByRole('searchbox', { name: list.search }).fill('Fake');
        await expect(page).toHaveURL(/q=Fake/);
        await expect(page).toHaveURL(/view=cards/);
      });
    }
  }
});

for (const role of ROLES.filter((r) => r !== 'OWNER')) {
  test(`${role}: each list it holds has the same toolbar and pager`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath(role) });
    const page = await ctx.newPage();
    const held = LISTS.filter((l) => EXPECTED_NAV[role].includes(l.id));
    for (const list of held) {
      await page.goto(list.path);
      const main = page.locator('main:visible');
      await expect(main.getByRole('searchbox', { name: list.search }), list.path).toBeVisible();
      await expect(main.getByTestId('pagination-range'), list.path).toBeVisible();
    }
    await ctx.close();
  });
}
