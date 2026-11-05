import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { test, expect, type Download, type Page } from '@playwright/test';

import { ROLES, storageStatePath } from '../../e2e/roles';
import { LOOSE_LINKS, SOURCE_LINKS } from '../../src/lib/mis/data-reset-groups';
import { withDb } from './db';

/**
 * R2 Danger Zone, through the real screen, on the dummy customer chain the local seed made.
 * The expected delete set is walked here from the live catalog, not taken from the code under test.
 */
const ACCESS_DENIED = 'You do not have access to this';
const NOT_RESTORED = 'mis_audit_logs'; // written by the reset itself, so it grows on purpose
const tableLabel = (name: string) => name.replace('mis_', '').replaceAll('_', ' ');
const sha256 = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

type Fk = { child: string; col: string; parent: string; parentCol: string };

const catalog = () =>
  withDb(async (q) => ({
    tables: (await q<{ t: string }>(`SELECT relname::text t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE nspname = 'public' AND relkind = 'r' AND relname LIKE 'mis\\_%' ORDER BY 1`)).map((r) => r.t),
    fks: await q<Fk>(
      `SELECT cl.relname::text child, a.attname::text col, pl.relname::text parent, pa.attname::text "parentCol"
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace
       JOIN pg_class pl ON pl.oid = c.confrelid JOIN pg_namespace pn ON pn.oid = pl.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attnum = c.confkey[1]
       WHERE c.contype = 'f' AND n.nspname = 'public' AND pn.nspname = 'public'`,
    ),
  }));

const counts = (tables: string[]) =>
  withDb(async (q) => {
    const out: Record<string, number> = {};
    for (const t of tables) out[t] = (await q<{ n: number }>(`SELECT count(*)::int n FROM "${t}"`))[0].n;
    return out;
  });

/** Every row as text, sorted: a byte-level picture of a table. */
const snapshot = (tables: string[]) =>
  withDb(async (q) => {
    const out: Record<string, string[]> = {};
    for (const t of tables) out[t] = (await q<{ r: string }>(`SELECT s::text r FROM "${t}" s ORDER BY 1`)).map((x) => x.r);
    return out;
  });

function closure(roots: string[], fks: Fk[]): Set<string> {
  const edges = [...fks, ...LOOSE_LINKS];
  const set = new Set(roots);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of edges) {
      if (set.has(e.parent) && !set.has(e.child)) {
        set.add(e.child);
        grew = true;
      }
    }
  }
  return set;
}

const orphans = (fks: Fk[]) =>
  withDb(async (q) => {
    const out: string[] = [];
    for (const f of fks) {
      const [{ n }] = await q<{ n: number }>(
        `SELECT count(*)::int n FROM "${f.child}" c WHERE c."${f.col}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${f.parent}" p WHERE p."${f.parentCol}" = c."${f.col}")`,
      );
      if (n) out.push(`${f.child}.${f.col}: ${n}`);
    }
    for (const l of SOURCE_LINKS) {
      const [{ n }] = await q<{ n: number }>(
        `SELECT count(*)::int n FROM "${l.table}" c WHERE c.source = $1 AND c.source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${l.parent}" p WHERE p.id::text = c.source_id::text)`,
        [l.source],
      );
      if (n) out.push(`${l.table}.source_id (${l.source}): ${n}`);
    }
    return out;
  });

async function enter(page: Page) {
  await page.goto('/mis/settings/danger-zone');
  await page.getByRole('button', { name: 'I understand, continue' }).click();
  await expect(page.getByRole('heading', { name: 'Step 1. Choose what to delete' })).toBeVisible();
}

test.describe('non-owners are refused', () => {
  for (const role of ROLES.filter((r) => r !== 'OWNER')) {
    test(`${role} gets neither the screen nor a backup`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: storageStatePath(role) });
      const page = await ctx.newPage();
      await page.goto('/mis/settings/danger-zone');
      await expect(page.getByText(ACCESS_DENIED).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'I understand, continue' })).toHaveCount(0);
      const res = await ctx.request.get('/api/mis/danger-zone/backup/00000000-0000-4000-8000-000000000000/json', { maxRedirects: 0 });
      expect(res.status()).toBe(403);
      await ctx.close();
    });
  }
});

test.describe.serial('Owner: dummy customer chain', () => {
  test.use({ storageState: storageStatePath('OWNER'), acceptDownloads: true });

  test('preview, backup, delete and restore', async ({ page }, info) => {
    test.setTimeout(240_000);
    const { tables, fks } = await catalog();
    const compared = tables.filter((t) => t !== NOT_RESTORED);
    const expectedSet = closure(['mis_customers'], fks);
    const before = await snapshot(compared);
    const beforeCounts = await counts([...expectedSet]);
    expect(beforeCounts.mis_customers, 'seed has dummy customers').toBeGreaterThan(0);
    expect(beforeCounts.mis_orders, 'seed has a dummy order chain').toBeGreaterThan(0);
    expect(await orphans(fks), 'seed starts clean').toEqual([]);

    await enter(page);
    await page.getByRole('checkbox', { name: /^Customers/ }).check();

    // Cascade tree: every dependent table, and the live row count of each.
    const items = page.locator('ul li').filter({ hasText: /: \d+$/ });
    await expect(items.first()).toBeVisible();
    const shown = Object.fromEntries(
      (await items.allInnerTexts()).map((text) => {
        const [, name, rows] = /^(?:└ )?(.*): (\d+)$/.exec(text.trim())!;
        return [name, Number(rows)];
      }),
    );
    expect(shown).toEqual(Object.fromEntries([...expectedSet].map((t) => [tableLabel(t), beforeCounts[t]])));

    await page.getByRole('button', { name: /^Delete Customers \+ ALL related data$/ }).click();
    await expect(page.getByRole('button', { name: 'Delete now' })).toHaveCount(0);

    // Backup: JSON and CSV zip reach the browser, and both match the checksums stored beside them.
    const downloads: Download[] = [];
    page.on('download', (d) => downloads.push(d));
    await page.getByRole('button', { name: 'Take backup now' }).click();
    await expect(page.getByText(/Backup saved and checksums verified/)).toBeVisible({ timeout: 60_000 });
    await expect.poll(() => downloads.length, { message: 'both files download' }).toBe(2);
    const listed = () => page.getByLabel('Backup to restore').locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    await expect.poll(async () => (await listed()).length - new Set(await listed()).size, { message: 'the new backup is listed once' }).toBe(0);
    const json = downloads.find((d) => d.suggestedFilename().endsWith('.json'))!;
    const zip = downloads.find((d) => d.suggestedFilename().endsWith('.csv.zip'))!;
    expect(json.suggestedFilename()).toMatch(/^bpp-backup-customers-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
    const jsonPath = info.outputPath('backup.json');
    const zipPath = info.outputPath('backup.csv.zip');
    await json.saveAs(jsonPath);
    await zip.saveAs(zipPath);

    const backupId = /backup\/([0-9a-f-]{36})\/json/.exec(json.url())![1];
    const folder = path.join('.local-storage', 'data-reset', 'backups', backupId);
    const manifest = JSON.parse(readFileSync(path.join(folder, 'manifest.json'), 'utf8')) as { checksums: Record<string, string>; counts: Record<string, number> };
    expect(sha256(jsonPath)).toBe(manifest.checksums[json.suggestedFilename()]);
    expect(sha256(zipPath)).toBe(manifest.checksums[zip.suggestedFilename()]);
    for (const [file, sum] of Object.entries(manifest.checksums)) expect(sha256(path.join(folder, file)), file).toBe(sum);

    const bundle = JSON.parse(readFileSync(jsonPath, 'utf8')) as { format: string; tables: Record<string, unknown[]> };
    expect(bundle.format).toBe('mis-backup-v1');
    for (const t of expectedSet) expect(bundle.tables[t]?.length, `${t} in the JSON`).toBe(beforeCounts[t]);
    const zipped = readFileSync(zipPath);
    expect(zipped.subarray(0, 2).toString()).toBe('PK');
    for (const t of ['mis_customers', 'mis_orders']) expect(zipped.includes(Buffer.from(`${t}.csv`)), `${t}.csv in the zip`).toBe(true);

    // Delete needs the typed word.
    const deleteNow = page.getByRole('button', { name: 'Delete now' });
    await expect(deleteNow).toBeDisabled();
    await page.getByLabel(/Type DELETE to confirm/).fill('delete');
    await expect(deleteNow).toBeDisabled();
    await page.getByLabel(/Type DELETE to confirm/).fill('DELETE');
    await deleteNow.click();
    const total = Object.values(beforeCounts).reduce((a, b) => a + b, 0);
    await expect(page.getByRole('status').filter({ hasText: `Deleted ${total} records` })).toBeVisible({ timeout: 60_000 });

    // No orphans, and nothing outside the set was touched.
    expect(await counts([...expectedSet])).toEqual(Object.fromEntries([...expectedSet].map((t) => [t, 0])));
    expect(await orphans(fks)).toEqual([]);
    const afterDelete = await snapshot(compared.filter((t) => !expectedSet.has(t) && t !== 'mis_inventory_ledger' && t !== 'mis_order_stock_allocations'));
    for (const [t, rows] of Object.entries(afterDelete)) expect(rows, `${t} untouched by the delete`).toEqual(before[t]);

    // Restore from a fresh page, as the Owner would: identical rows come back.
    await enter(page);
    const select = page.getByLabel('Backup to restore');
    const values = await select.locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
    expect(new Set(values).size, 'each backup listed once').toBe(values.length);
    await select.selectOption(backupId);
    const restore = page.getByRole('button', { name: 'Restore backup' });
    await expect(restore).toBeDisabled();
    await page.getByLabel(/Type RESTORE to confirm/).fill('RESTORE');
    await restore.click();
    await expect(page.getByRole('status').filter({ hasText: /Restored \d+ records/ })).toBeVisible({ timeout: 60_000 });

    const after = await snapshot(compared);
    for (const t of compared) expect(after[t], `${t} restored row for row`).toEqual(before[t]);
    expect(await orphans(fks)).toEqual([]);

    const actions = await withDb((q) => q<{ action: string }>(`SELECT action FROM mis_audit_logs WHERE entity = 'data-reset' AND entity_id = $1`, [backupId]));
    expect(actions.map((a) => a.action).sort()).toEqual(expect.arrayContaining(['data.backup', 'data.delete', 'data.restore']));
  });
});
