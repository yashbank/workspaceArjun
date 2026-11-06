import { test, expect, type Download, type Page } from '@playwright/test';

import { storageStatePath } from '../../e2e/roles';
import { withDb } from './db';

/**
 * R8 follow-up, through the real screens, on the local seed. A Purchasing clear takes the whole stock books, so stock reads
 * 0 on the ledger's screen and the store book's alike, and a restore puts every row back. An Employees clear leaves kept
 * staff's worker allocations. The vitest integration suite checks every stock reader; this checks what the Owner sees.
 */
const STOCK_TABLES = ['mis_inventory_ledger', 'mis_store_transactions', 'mis_store_returns', 'mis_physical_counts', 'mis_order_stock_allocations', 'mis_quarantine_stock', 'mis_material_requests'];
const tableLabel = (name: string) => name.replace('mis_', '').replaceAll('_', ' ');

const misTables = () =>
  withDb(async (q) => (await q<{ t: string }>(`SELECT relname::text t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE nspname = 'public' AND relkind = 'r' AND relname LIKE 'mis\\_%' AND relname <> 'mis_audit_logs' ORDER BY 1`)).map((r) => r.t));

const snapshot = (tables: string[]) =>
  withDb(async (q) => {
    const out: Record<string, string[]> = {};
    for (const t of tables) out[t] = (await q<{ r: string }>(`SELECT s::text r FROM "${t}" s ORDER BY 1`)).map((x) => x.r);
    return out;
  });

const rowCounts = (tables: string[]) =>
  withDb(async (q) => {
    const out: Record<string, number> = {};
    for (const t of tables) out[t] = (await q<{ n: number }>(`SELECT count(*)::int n FROM "${t}"`))[0].n;
    return out;
  });

/** An active item both books hold a balance for, so each screen has a figure to lose. The longest code, so searching it finds that item alone. */
const stockedItem = () =>
  withDb(async (q) => {
    const rows = await q<{ code: string; unit: string; ledger: string; book: string; txn: string }>(
      `SELECT i.code, i.unit, l.balance_qty::float8::text ledger, t.balance_qty::numeric(12,2)::text book, t.txn_number txn
       FROM mis_items i
       JOIN LATERAL (SELECT balance_qty FROM mis_inventory_ledger x WHERE x.item_id = i.id ORDER BY created_at DESC LIMIT 1) l ON true
       JOIN LATERAL (SELECT balance_qty, txn_number FROM mis_store_transactions x WHERE x.item_id = i.id ORDER BY created_at DESC LIMIT 1) t ON true
       WHERE i.deleted_at IS NULL AND i.is_active AND l.balance_qty > 0 AND t.balance_qty > 0
       ORDER BY length(i.code) DESC, i.code LIMIT 1`,
    );
    expect(rows.length, 'seed has an item with stock in both books').toBe(1);
    return rows[0];
  });

async function expectBalances(page: Page, code: string, ledger: string, book: string) {
  // The figure in this item's own Balance cell: a bare "0" anywhere on the page would prove nothing.
  await page.goto(`/mis/inventory?q=${encodeURIComponent(code)}&view=rows`);
  const table = page.locator('main:visible table:visible');
  const row = table.locator('tbody tr').filter({ has: page.getByRole('cell', { name: code, exact: true }) });
  await expect(row).toHaveCount(1);
  const balance = (await table.locator('thead th').allInnerTexts()).findIndex((h) => /balance/i.test(h));
  expect(balance, 'the table has a Balance column').toBeGreaterThanOrEqual(0);
  await expect(row.locator('td').nth(balance)).toHaveText(ledger);
  await page.goto(`/mis/store/stock?q=${encodeURIComponent(code)}`);
  await expect(page.getByText(code).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`^${book.replace('.', '\\.')}\\b`)).filter({ visible: true }).first()).toBeVisible();
}

async function enter(page: Page) {
  await page.goto('/mis/settings/danger-zone');
  await page.getByRole('button', { name: 'I understand, continue' }).click();
  await expect(page.getByRole('heading', { name: 'Step 1. Choose what to delete' })).toBeVisible();
}

/** Goes from an entered screen with the choice made through backup and delete. Returns the backup's id. */
async function backUpAndDelete(page: Page): Promise<string> {
  await page.getByRole('button', { name: /^Delete .* \+ ALL related data$/ }).click();
  const downloads: Download[] = [];
  page.on('download', (d) => downloads.push(d));
  await page.getByRole('button', { name: 'Take backup now' }).click();
  await expect(page.getByText(/Backup saved and checksums verified/)).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => downloads.length, { message: 'both files download' }).toBe(2);
  const backupId = /backup\/([0-9a-f-]{36})\/json/.exec(downloads.find((d) => d.suggestedFilename().endsWith('.json'))!.url())![1];
  await page.getByLabel(/Type DELETE to confirm/).fill('DELETE');
  await page.getByRole('button', { name: 'Delete now' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Deleted \d+ records/ })).toBeVisible({ timeout: 60_000 });
  return backupId;
}

async function restore(page: Page, backupId: string) {
  await enter(page);
  await page.getByLabel('Backup to restore').selectOption(backupId);
  await page.getByLabel(/Type RESTORE to confirm/).fill('RESTORE');
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Restored \d+ records/ })).toBeVisible({ timeout: 60_000 });
}

test.describe.serial('Owner: stock books and kept staff', () => {
  test.use({ storageState: storageStatePath('OWNER'), acceptDownloads: true });

  test('a Purchasing clear shows the books in the tree, stock reads 0 everywhere, and a restore brings it back', async ({ page }) => {
    test.setTimeout(240_000);
    // The app writes its default rule rows on first read, so this test's screens are read once before the snapshot.
    for (const url of ['/mis/inventory', '/mis/store/stock', '/mis/store/transactions', '/mis/store/dashboard', '/mis/settings/danger-zone']) await page.goto(url);
    const tables = await misTables();
    const before = await snapshot(tables);
    const { code, ledger, book, txn } = await stockedItem();
    const items = before.mis_items.length;
    const counts = await rowCounts(['mis_inventory_ledger', 'mis_store_transactions']);
    await expectBalances(page, code, ledger, book);

    await enter(page);
    await page.getByRole('checkbox', { name: /^Purchasing/ }).check();
    for (const t of ['mis_inventory_ledger', 'mis_store_transactions']) await expect(page.locator('ul li').filter({ hasText: `${tableLabel(t)}: ${counts[t]}` })).toBeVisible();
    await expect(page.getByText(/Stock will read 0 for every item/)).toBeVisible();

    const backupId = await backUpAndDelete(page);
    expect(await rowCounts(STOCK_TABLES)).toEqual(Object.fromEntries(STOCK_TABLES.map((t) => [t, 0])));
    expect((await rowCounts(['mis_items'])).mis_items, 'the item list stays').toBe(items);

    await expectBalances(page, code, '0', '0.00');
    for (const url of ['/mis/store/transactions', '/mis/store/dashboard']) {
      await page.goto(url);
      await expect(page.getByRole('heading').first()).toBeVisible();
      await expect(page.getByText(txn)).toHaveCount(0);
    }

    await restore(page, backupId);
    const after = await snapshot(tables);
    for (const t of tables) expect(after[t], `${t} restored row for row`).toEqual(before[t]);
    await expectBalances(page, code, ledger, book);
  });

  test("an Employees clear keeps a kept person's worker allocation, and a restore brings the rest back", async ({ page }) => {
    test.setTimeout(240_000);
    const [{ id, employee_id: was, kept }] = await withDb((q) =>
      q<{ id: string; employee_id: string; kept: string }>(
        `SELECT a.id, a.employee_id, (SELECT e.id FROM mis_employees e WHERE e.user_profile_id IS NOT NULL ORDER BY e.id LIMIT 1) kept FROM mis_worker_allocations a ORDER BY a.id LIMIT 1`,
      ),
    );
    await withDb((q) => q(`UPDATE mis_worker_allocations SET employee_id = $1 WHERE id = $2`, [kept, id]));
    try {
      const tables = await misTables();
      const before = await snapshot(tables);

      await enter(page);
      await page.getByRole('checkbox', { name: /^Employees/ }).check();
      await expect(page.locator('ul li').filter({ hasText: 'worker allocations:' })).toBeVisible();
      const backupId = await backUpAndDelete(page);

      const left = await withDb((q) => q<{ id: string; n: number }>(`SELECT a.id, (SELECT count(*)::int FROM mis_worker_allocations b WHERE b.employee_id NOT IN (SELECT id FROM mis_employees)) n FROM mis_worker_allocations a WHERE a.id = $1`, [id]));
      expect(left, 'the kept person keeps the row, and no row points at a removed person').toEqual([{ id, n: 0 }]);

      await restore(page, backupId);
      const after = await snapshot(tables);
      for (const t of tables) expect(after[t], `${t} restored row for row`).toEqual(before[t]);
    } finally {
      await withDb((q) => q(`UPDATE mis_worker_allocations SET employee_id = $1 WHERE id = $2`, [was, id]));
    }
  });
});
