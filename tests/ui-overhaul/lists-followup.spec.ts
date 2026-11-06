import { test, expect } from '@playwright/test';

import { storageStatePath } from '../../e2e/roles';

/** R8 follow-up: inventory, store stock, store transactions and supplier invoices use the shared ListToolbar; theme.write is Owner only. */
const LISTS = [
  { path: '/mis/inventory', search: 'Search items…' },
  { path: '/mis/store/stock', search: 'Search by name, code or SKU…' },
  { path: '/mis/store/transactions', search: 'Search by txn no., item, ref…' },
  { path: '/mis/supplier-invoices', search: 'Search invoice, PO or supplier…' },
] as const;
/** T5's five widths, the same rule as responsive.spec.ts, which does not reach these lists' views. */
const WIDTHS = [375, 1440, 320, 768, 1024];

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

  for (const list of LISTS) {
    test(`${list.path}: T5 widths, cards and rows: no sideways scroll, 44px targets`, async ({ page }) => {
      test.setTimeout(180_000);
      const problems: string[] = [];
      for (const view of ['', '?view=rows']) {
        await page.setViewportSize({ width: WIDTHS[0], height: 800 });
        await page.goto(list.path + view);
        await expect(page.locator('main:visible').getByRole('searchbox', { name: list.search })).toBeVisible();
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 800 });
          await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
          const found = await page.evaluate(() => {
            const root = document.documentElement;
            const small: string[] = [];
            for (const el of document.querySelectorAll<HTMLElement>('a[href],button,select,textarea,input:not([type=hidden]),[role=button],[role=tab],summary')) {
              const box = (el.matches('input[type=checkbox],input[type=radio]') && el.closest('label')) || el;
              const r = box.getBoundingClientRect();
              const css = getComputedStyle(el);
              if (r.width <= 1 || r.height <= 1 || css.visibility === 'hidden' || css.pointerEvents === 'none' || el.closest('[aria-hidden="true"]')) continue;
              if (el.tagName === 'A' && css.display === 'inline' && el.closest('p')) continue;
              if (Math.min(r.width, r.height) < 43.5) small.push(`${el.tagName} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
            }
            return { overflow: root.scrollWidth - root.clientWidth, small };
          });
          if (found.overflow > 0) problems.push(`${view} @${width}: page scrolls sideways by ${found.overflow}px`);
          for (const s of found.small) problems.push(`${view} @${width}: small target ${s}`);
        }
      }
      expect(problems).toEqual([]);
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

  test('transactions: a typed date stays in the field and commits on Enter or on leaving it, never per keystroke', async ({ page }) => {
    await page.goto('/mis/store/transactions');
    const main = page.locator('main:visible');
    const from = main.getByLabel('From date');
    await from.focus();
    // Day and month are equal, so the field's order (it follows the browser locale) does not matter.
    await page.keyboard.type('01012026');
    await expect(from).toHaveValue('2026-01-01');
    await expect(page).not.toHaveURL(/from=/);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/from=2026-01-01/);

    const to = main.getByLabel('To date');
    await to.focus();
    await page.keyboard.type('02022026');
    await expect(to).toHaveValue('2026-02-02');
    await expect(page).not.toHaveURL(/to=/);
    await to.blur();
    await expect(page).toHaveURL(/to=2026-02-02/);

    await main.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page).not.toHaveURL(/from=|to=/);
    await expect(main.getByLabel('From date')).toHaveValue('');
  });

  test('store stock: category and status are URL params, and Clear filters shows for and drops either alone', async ({ page }) => {
    await page.goto('/mis/store/stock');
    const main = page.locator('main:visible');
    for (const [label, value, param] of [['Category', 'RAW_MATERIAL', /category=RAW_MATERIAL/], ['Status', 'critical', /status=critical/]] as const) {
      await expect(main.getByRole('link', { name: 'Clear filters' })).toHaveCount(0);
      await main.getByLabel(label).selectOption(value);
      await expect(page).toHaveURL(param);
      await page.reload();
      await expect(main.getByLabel(label)).toHaveValue(value);
      await main.getByRole('link', { name: 'Clear filters' }).click();
      await expect(page).not.toHaveURL(param);
      await expect(main.getByLabel(label)).toHaveValue('');
    }
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
