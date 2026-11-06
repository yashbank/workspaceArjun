// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LOOSE_LINKS, RESET_GROUPS, tablesForGroups, type ResetGroupId } from '@/lib/mis/data-reset-groups';

import { OWNER_USER, STAFF_USER, liveForeignKeys, misTables, rowId, seedWorld, snapshotRows, type FkColumn } from './testing/data-reset-world';

/**
 * The Danger Zone against a real Postgres. It wipes tables, so it only runs when every database URL in the environment
 * is 127.0.0.1 (see the throwaway-DB script); `pnpm test` skips it. The sign-in lookup is the only thing mocked.
 */
const isLocal = (url: string) => new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname === '127.0.0.1';
const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL, process.env.RUNTIME_DATABASE_URL].filter((u): u is string => !!u);
const LOCAL_DB = !!process.env.DATABASE_URL && urls.every(isLocal) && process.env.STORAGE_DRIVER === 'local';

let signedIn: string | null = OWNER_USER;
vi.mock('@/server/auth', () => ({ getCurrentUser: async () => (signedIn ? { id: signedIn } : null) }));

const ALL_GROUPS = RESET_GROUPS.map((g) => g.id);
const CASES: [string, ResetGroupId[]][] = [...ALL_GROUPS.map((id): [string, ResetGroupId[]] => [id, [id]]), ['clear-all', ALL_GROUPS]];
const NOT_RESTORED = 'mis_audit_logs'; // written by the reset itself, so it grows on purpose

/** The expected delete set, walked here from the live catalog rather than by the code under test. */
function closure(roots: string[], fks: FkColumn[]): Set<string> {
  // Employees are only partly cleared, so a set-null child stays and the database blanks its link.
  const edges = [...fks.filter((f) => !(f.parent === 'mis_employees' && f.onDelete === 'n')), ...LOOSE_LINKS];
  const set = new Set(roots);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of edges) if (set.has(e.parent) && !set.has(e.child)) grew = !!set.add(e.child);
  }
  return set;
}

describe.skipIf(!LOCAL_DB)('Danger Zone on a real Postgres', () => {
  let db: Awaited<typeof import('@/server/db')>['db'];
  let reset: typeof import('./data-reset');
  let storage: typeof import('@/server/storage');
  let root: string;
  let fks: FkColumn[];
  let tables: string[];
  let seeded: Record<string, number>;

  const compared = () => tables.filter((t) => t !== NOT_RESTORED);
  const rowCount = async (t: string) => (await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${t}"`))[0].n;
  const backupFile = (id: string, file: string) => path.join(root, 'data-reset', 'backups', id, file);
  /** The kept Owner and Admin never clear, so the delete count for employees is the two workers. */
  const clearable = (t: string) => (t === 'mis_employees' ? 2 : seeded[t]);

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'bpp-danger-zone-'));
    process.env.LOCAL_STORAGE_PATH = root;
    ({ db } = await import('@/server/db'));
    reset = await import('./data-reset');
    storage = await import('@/server/storage');
    const [{ addr }] = await db.$queryRawUnsafe<{ addr: string }[]>(`SELECT host(inet_server_addr()) AS addr`);
    expect(addr).toBe('127.0.0.1');
    fks = await liveForeignKeys(db);
    tables = await misTables(db);
  });

  beforeEach(async () => {
    signedIn = OWNER_USER;
    seeded = await seedWorld(db);
  }, 60_000);

  afterAll(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  describe('1-3, 6. every group: preview, delete, restore', () => {
    it.each(CASES)(
      '%s',
      async (_name, ids) => {
        const before = await snapshotRows(db, compared());
        const expected = closure(tablesForGroups(ids), fks);

        // 1. the preview names every table the delete touches, with the seeded count
        const preview = await reset.previewDelete({ groupIds: ids });
        expect(Object.fromEntries(preview.tree.map((r) => [r.name, r.rows]))).toEqual(Object.fromEntries([...expected].map((t) => [t, clearable(t)])));

        // 3. no FK error, and exactly the preview's rows go
        const backup = await reset.createBackup({ groupIds: ids });
        const result = await reset.deleteSelectedData({ groupIds: ids, backupId: backup.id, confirm: 'DELETE' });
        expect(result.perTable).toEqual(Object.fromEntries([...expected].map((t) => [t, clearable(t)])));

        const after = await snapshotRows(db, compared());
        for (const t of compared()) {
          if (!expected.has(t)) continue;
          expect(after[t].length, t).toBe(seeded[t] - clearable(t));
        }
        await expectNoDanglingIds();
        await expectOthersUntouched(before, after, expected);

        const audit = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM mis_audit_logs WHERE action = 'data.delete' AND entity_id = $1`, backup.id);
        expect(audit[0].n).toBe(1);

        // 6. every row comes back byte for byte
        await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
        expect(await snapshotRows(db, compared())).toEqual(before);
      },
      60_000,
    );

    async function expectNoDanglingIds() {
      const live = new Set(tables);
      for (const [child, col, parent] of [
        ['mis_document_versions', 'ref_id', 'mis_orders'],
        ['mis_quarantine_stock', 'grn_item_id', 'mis_grn_items'],
        ['mis_quarantine_stock', 'supplier_id', 'mis_suppliers'],
        ['mis_payroll_snapshot_lines', 'employee_id', 'mis_employees'],
      ]) {
        expect(live.has(child) && live.has(parent)).toBe(true);
        const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n FROM "${child}" c WHERE c."${col}" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "${parent}" p WHERE p.id = c."${col}")`,
        );
        expect(n, `${child}.${col}`).toBe(0);
      }
      const [{ n: refs }] = await db.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM mis_purchase_orders po WHERE po.bom_ref IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mis_orders o WHERE o.order_number = po.bom_ref)`,
      );
      expect(refs, 'mis_purchase_orders.bom_ref').toBe(0);
      const dangling = await db.$queryRawUnsafe<{ source: string; source_id: string }[]>(
        `SELECT l.source, l.source_id FROM mis_inventory_ledger l WHERE l.source_id IS NOT NULL AND NOT EXISTS (
           SELECT 1 FROM mis_orders o WHERE l.source = 'STORE_ISSUE' AND o.id::text = l.source_id
           UNION ALL SELECT 1 FROM mis_grns g WHERE l.source IN ('GRN', 'GRN_REVERSAL') AND g.id::text = l.source_id
           UNION ALL SELECT 1 FROM mis_store_returns r WHERE l.source = 'STORE_RETURN' AND r.id::text = l.source_id
           UNION ALL SELECT 1 FROM mis_physical_counts c WHERE l.source = 'COUNT_ADJUSTMENT' AND c.id::text = l.source_id)`,
      );
      expect(dangling).toEqual([]);
      const [{ n: allocs }] = await db.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM mis_order_stock_allocations a WHERE a.source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mis_grns g WHERE g.id::text = a.source_id)`,
      );
      expect(allocs, 'mis_order_stock_allocations.source_id').toBe(0);
    }

    /** A table outside the delete set keeps every row; only blanked links (source_id, set-null into employees) may differ. */
    async function expectOthersUntouched(before: Record<string, string[]>, after: Record<string, string[]>, deleted: Set<string>) {
      const blanked = ['mis_inventory_ledger', 'mis_order_stock_allocations', 'mis_job_phases', 'mis_production_log'];
      for (const t of compared()) {
        if (deleted.has(t) || blanked.includes(t)) continue;
        expect(after[t], t).toEqual(before[t]);
      }
      for (const t of blanked) if (!deleted.has(t)) expect(after[t].length, t).toBe(before[t].length);
    }
  });

  it('1. the customer chain: customers pulls in every link the Owner listed, with seeded counts', async () => {
    const { tree } = await reset.previewDelete({ groupIds: ['customers'] });
    const rows = Object.fromEntries(tree.map((r) => [r.name, r.rows]));
    for (const t of [
      'mis_customers', 'mis_orders', 'mis_bom', 'mis_bom_stages', 'mis_bom_materials', 'mis_purchase_orders', 'mis_po_items', 'mis_grns', 'mis_grn_items',
      'mis_production_log', 'mis_job_phases', 'mis_machine_allocations', 'mis_worker_allocations', 'mis_supplier_invoices', 'mis_qc_checks', 'mis_line_clearances',
      'mis_documents', 'mis_document_versions',
    ]) {
      expect(rows[t], t).toBe(2);
    }
    // The plan lists dispatch, but no table holds it yet. A future one is walked through its FK; this pins the gap.
    expect(tables.filter((t) => t.includes('dispatch'))).toEqual([]);
  });

  describe('2. live graph', () => {
    function schemaFks(): Set<string> {
      const schema = readFileSync('prisma/schema.prisma', 'utf8');
      const models = new Map<string, { table: string; body: string }>();
      for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) models.set(m[1], { table: m[2].match(/@@map\("([^"]+)"\)/)?.[1] ?? m[1], body: m[2] });
      const edges = new Set<string>();
      for (const { table, body } of models.values()) {
        for (const line of body.split('\n')) {
          const rel = line.match(/^\s*\w+\s+(\w+)\??\s+@relation\(.*fields:\s*\[(\w+)\]/);
          if (!rel) continue;
          const field = body.match(new RegExp(`^\\s*${rel[2]}\\s+.*$`, 'm'))?.[0] ?? '';
          edges.add(`${table}.${field.match(/@map\("([^"]+)"\)/)?.[1] ?? rel[2]} -> ${models.get(rel[1])!.table}`);
        }
      }
      return edges;
    }

    it('pg_constraint and schema.prisma name the same foreign keys', () => {
      const live = new Set(fks.map((f) => `${f.child}.${f.col} -> ${f.parent}`));
      const schema = schemaFks();
      // Real in the database, plain scalars in schema.prisma. The delete walks the catalog, so they are not missed.
      expect([...live].filter((e) => !schema.has(e)).sort()).toEqual([
        'mis_documents.uploaded_by -> users',
        'mis_extra_pay_day_departments.department_id -> mis_departments',
        'mis_extra_pay_day_employees.employee_id -> mis_employees',
      ]);
      // In schema.prisma but never migrated. Not a MIS table, so no clear reaches it.
      expect([...schema].filter((e) => !live.has(e)).sort()).toEqual(['audit_stars.user_id -> user_profiles']);
    });

    it('clear-all reaches every MIS table that is not protected, and no FK child of a deleted table stays behind', async () => {
      const preview = await reset.previewDelete({ groupIds: ALL_GROUPS });
      const deleted = new Set(preview.tree.map((r) => r.name));
      const { PROTECTED_TABLES } = await import('@/lib/mis/data-reset-groups');
      expect(tables.filter((t) => !deleted.has(t) && !PROTECTED_TABLES.includes(t))).toEqual([]);
      for (const f of fks) if (deleted.has(f.parent)) expect(deleted.has(f.child), `${f.child} -> ${f.parent}`).toBe(true);
    });
  });

  describe('4. a failure mid-delete', () => {
    it.each([
      ['customers', 'mis_customers'],
      ['employees', 'mis_employees'],
    ] as [ResetGroupId, string][])('%s: a refusal at %s rolls every table back', async (id, last) => {
      const before = await snapshotRows(db, compared());
      const backup = await reset.createBackup({ groupIds: [id] });
      await db.$executeRawUnsafe(`CREATE FUNCTION boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced failure'; END $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER boom BEFORE DELETE ON "${last}" FOR EACH ROW EXECUTE FUNCTION boom()`);
      try {
        await expect(reset.deleteSelectedData({ groupIds: [id], backupId: backup.id, confirm: 'DELETE' })).rejects.toThrow(/forced failure/);
      } finally {
        await db.$executeRawUnsafe(`DROP TRIGGER boom ON "${last}"`);
        await db.$executeRawUnsafe(`DROP FUNCTION boom()`);
      }
      expect(await snapshotRows(db, compared())).toEqual(before);
    }, 60_000);
  });

  describe('5. backup files', () => {
    it('writes JSON and CSV zip under the required name and refuses a tampered file', async () => {
      const backup = await reset.createBackup({ groupIds: ['customers', 'machine_allocation'] });
      expect(backup.name).toMatch(/^bpp-backup-customers-machine-allocation-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);

      const bundle = JSON.parse(readFileSync(backupFile(backup.id, `${backup.name}.json`), 'utf8'));
      expect(bundle.format).toBe('mis-backup-v1');
      expect(bundle.tables.mis_customers).toHaveLength(2);
      expect(bundle.tables.mis_audit_logs).toBeUndefined();

      const zip = readFileSync(backupFile(backup.id, `${backup.name}.csv.zip`));
      expect(zip.subarray(0, 2).toString()).toBe('PK');
      for (const t of ['mis_customers', 'mis_orders', 'mis_production_log']) expect(zip.includes(`${t}.csv`), t).toBe(true);

      const download = await reset.getBackupDownload({ backupId: backup.id, kind: 'json' });
      expect('fileName' in download && download.fileName).toBe(`${backup.name}.json`);
      const overview = await reset.getDangerZoneOverview();
      expect(overview.backups[0].id).toBe(backup.id);
      expect(overview.groups.find((g) => g.id === 'employees')?.rows).toBeGreaterThan(0);

      for (const file of ['mis_customers.json', `${backup.name}.json`, `${backup.name}.csv.zip`]) {
        const original = readFileSync(backupFile(backup.id, file));
        writeFileSync(backupFile(backup.id, file), Buffer.concat([original, Buffer.from(' ')]));
        await expect(reset.deleteSelectedData({ groupIds: ['customers'], backupId: backup.id, confirm: 'DELETE' }), file).rejects.toThrow(/could not be verified/);
        await expect(reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' }), file).rejects.toThrow(/could not be verified/);
        writeFileSync(backupFile(backup.id, file), original);
      }
      expect(await rowCount('mis_customers')).toBe(2);
    }, 60_000);

    it('refuses a backup with a file gone, in words the Owner can read', async () => {
      const backup = await reset.createBackup({ groupIds: ['customers'] });
      rmSync(backupFile(backup.id, 'mis_customers.json'));
      await expect(reset.deleteSelectedData({ groupIds: ['customers'], backupId: backup.id, confirm: 'DELETE' })).rejects.toThrow(reset.DataResetError);
      expect(await rowCount('mis_customers')).toBe(2);
    }, 60_000);
  });

  describe('6. restore details', () => {
    it('brings back a running phase whose earlier phase was reopened, which the start gate alone would refuse', async () => {
      const order = rowId('mis_orders', 2);
      const proc = rowId('mis_processes', 1);
      const [first, second] = [rowId('phase', 1), rowId('phase', 2)];
      const insert = `INSERT INTO mis_job_phases (id, order_id, process_id, sequence, status, started_at, signed_off_at, signed_off_by_id) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'SIGNED_OFF', now(), now(), $2::uuid)`;
      await db.$executeRawUnsafe(insert, first, order, proc, 10);
      await db.$executeRawUnsafe(`INSERT INTO mis_job_phases (id, order_id, process_id, sequence, status, started_at) VALUES ($1::uuid, $2::uuid, $3::uuid, 11, 'IN_PROGRESS', now())`, second, order, proc);
      await db.$executeRawUnsafe(`UPDATE mis_job_phases SET status = 'REOPENED', reopen_reason = 'qc', reopened_at = now() WHERE id = $1::uuid`, first);
      // An update moves the row, so this leaves the reopened phase ahead of the running one in the backup's row order.
      await db.$executeRawUnsafe(`UPDATE mis_job_phases SET updated_at = now() WHERE id = $1::uuid`, second);

      const before = await snapshotRows(db, compared());
      const backup = await reset.createBackup({ groupIds: ['customers'] });
      const ids = JSON.parse(readFileSync(backupFile(backup.id, 'mis_job_phases.json'), 'utf8')).map((r: { id: string }) => r.id);
      expect(ids.indexOf(first)).toBeLessThan(ids.indexOf(second));
      await reset.deleteSelectedData({ groupIds: ['customers'], backupId: backup.id, confirm: 'DELETE' });
      await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
      await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
      expect(await snapshotRows(db, compared())).toEqual(before);
    }, 60_000);

    it('is safe to run twice', async () => {
      const before = await snapshotRows(db, compared());
      const backup = await reset.createBackup({ groupIds: ['customers'] });
      await reset.deleteSelectedData({ groupIds: ['customers'], backupId: backup.id, confirm: 'DELETE' });
      await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
      const second = await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
      expect(second.rowsRestored).toBe(0);
      expect(await snapshotRows(db, compared())).toEqual(before);
    }, 60_000);

    // Known gap, pinned: JSON null comes back as SQL NULL. Nothing in the app writes one. Flip to `it` if that changes.
    it.fails('keeps JSON null apart from SQL NULL', async () => {
      await db.$executeRawUnsafe(`UPDATE mis_document_versions SET snapshot = 'null'::jsonb WHERE id = $1::uuid`, rowId('mis_document_versions', 1));
      const before = await snapshotRows(db, compared());
      const backup = await reset.createBackup({ groupIds: ['customers'] });
      await reset.deleteSelectedData({ groupIds: ['customers'], backupId: backup.id, confirm: 'DELETE' });
      await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
      expect((await snapshotRows(db, compared())).mis_document_versions).toEqual(before.mis_document_versions);
    }, 60_000);
  });

  describe('R8 review', () => {
    const log1 = rowId('mis_production_log', 1);
    const log2 = rowId('mis_production_log', 2);
    const phase1 = rowId('mis_job_phases', 1);
    const ownerRow = rowId('mis_employees', 3);
    const cell = async <T,>(t: string, col: string, id: string) => (await db.$queryRawUnsafe<{ v: T }[]>(`SELECT "${col}" AS v FROM "${t}" WHERE id = $1::uuid`, id))[0].v;
    const clearEmployees = async () => {
      const backup = await reset.createBackup({ groupIds: ['employees'] });
      await reset.deleteSelectedData({ groupIds: ['employees'], backupId: backup.id, confirm: 'DELETE' });
      return backup;
    };

    it('3. clearing employees keeps production, job phases and machine allocations; the link blanks and a restore refills it', async () => {
      await db.$executeRawUnsafe(`UPDATE mis_production_log SET employee_id = $1::uuid WHERE id = $2::uuid`, ownerRow, log2);
      const before = await snapshotRows(db, compared());
      const backup = await clearEmployees();

      for (const t of ['mis_production_log', 'mis_job_phases', 'mis_machine_allocations']) expect(await rowCount(t), t).toBe(seeded[t]);
      expect(await rowCount('mis_employees')).toBe(2);
      expect(await cell('mis_production_log', 'employee_id', log1)).toBeNull();
      expect(await cell('mis_job_phases', 'in_charge_employee_id', phase1)).toBeNull();
      expect(await cell('mis_production_log', 'employee_id', log2), 'a kept person keeps their link').toBe(ownerRow);

      const restored = await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
      expect(restored.linksRestored).toBeGreaterThan(1);
      expect(await snapshotRows(db, compared())).toEqual(before);
    }, 60_000);

    it('4. a restored row that clashes on a second unique key is refused by name, and nothing is restored', async () => {
      const code = await cell<string>('mis_customers', 'code', rowId('mis_customers', 1));
      const backup = await reset.createBackup({ groupIds: ['customers'] });
      await reset.deleteSelectedData({ groupIds: ['customers'], backupId: backup.id, confirm: 'DELETE' });
      await db.$executeRawUnsafe(`INSERT INTO mis_customers (id, code, name, updated_at) VALUES ($1::uuid, $2, 'New after the clear', now())`, rowId('clash', 1), code);
      const cleared = await snapshotRows(db, compared());

      const attempt = reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
      await expect(attempt).rejects.toThrow(reset.DataResetError);
      await expect(attempt).rejects.toThrow(/mis_customers/);
      expect(await snapshotRows(db, compared())).toEqual(cleared);
    }, 60_000);

    describe('5. a delete refuses a backup that no longer matches', () => {
      const refused = async (ids: ResetGroupId[], edit: string, ...args: unknown[]) => {
        const backup = await reset.createBackup({ groupIds: ids });
        await db.$executeRawUnsafe(edit, ...args);
        const before = await snapshotRows(db, compared());
        await expect(reset.deleteSelectedData({ groupIds: ids, backupId: backup.id, confirm: 'DELETE' })).rejects.toThrow(/changed since that backup/);
        expect(await snapshotRows(db, compared())).toEqual(before);
      };

      it('same-count edit of a table with updated_at', () => refused(['customers'], `UPDATE mis_customers SET name = 'Edited', updated_at = now() WHERE id = $1::uuid`, rowId('mis_customers', 1)), 60_000);
      it('same-count edit of a table without one', () => refused(['customers'], `UPDATE mis_production_log SET qty_produced = qty_produced + 1 WHERE id = $1::uuid`, log1), 60_000);
      it('a table only touched by SOURCE_LINKS blanking', () => refused(['customers'], `UPDATE mis_inventory_ledger SET notes = 'late' WHERE id = $1::uuid`, rowId('mis_inventory_ledger', 2)), 60_000);
      it('a table whose set-null link the delete blanks', () => refused(['employees'], `UPDATE mis_production_log SET qty_produced = qty_produced + 1 WHERE id = $1::uuid`, log1), 60_000);
    });

    it('6. a link cleared on purpose after the backup stays clear when nothing brought its parent back', async () => {
      const backup = await reset.createBackup({ groupIds: ['customers'] });
      const ledger = rowId('mis_inventory_ledger', 2);
      await db.$executeRawUnsafe(`UPDATE mis_production_log SET employee_id = NULL WHERE id = $1::uuid`, log1);
      await db.$executeRawUnsafe(`UPDATE mis_inventory_ledger SET source_id = NULL WHERE id = $1::uuid`, ledger);
      const restored = await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
      expect(restored.linksRestored).toBe(0);
      expect(await cell('mis_production_log', 'employee_id', log1)).toBeNull();
      expect(await cell('mis_inventory_ledger', 'source_id', ledger)).toBeNull();
    }, 60_000);

    it('6. a blanked link whose parent the restore cannot bring back stays blank and does not abort', async () => {
      const worker = rowId('mis_employees', 2);
      const [auth, profile] = [rowId('auth.users', 3), rowId('user_profiles', 3)];
      await db.$executeRawUnsafe(`INSERT INTO auth.users (id, email) VALUES ($1::uuid, 'dummy3@example.test')`, auth);
      await db.$executeRawUnsafe(`INSERT INTO user_profiles (id, auth_id, email, updated_at) VALUES ($1::uuid, $2::uuid, 'dummy3@example.test', now())`, profile, auth);
      await db.$executeRawUnsafe(`UPDATE mis_employees SET user_profile_id = $1::uuid WHERE id = $2::uuid`, profile, worker);
      const backup = await reset.createBackup({ groupIds: ['customers'] });
      await db.$executeRawUnsafe(`DELETE FROM user_profiles WHERE id = $1::uuid`, profile);

      await expect(reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' })).resolves.toMatchObject({ rowsRestored: 0, linksRestored: 0 });
      expect(await cell('mis_employees', 'user_profile_id', worker)).toBeNull();
    }, 60_000);
  });

  describe('7. refusals', () => {
    const untouched = async () => expect(await rowCount('mis_customers')).toBe(2);

    it('needs the typed word, for delete and for restore', async () => {
      const backup = await reset.createBackup({ groupIds: ['customers'] });
      for (const confirm of ['', 'delete', 'DELETE ', 'RESTORE']) {
        await expect(reset.deleteSelectedData({ groupIds: ['customers'], backupId: backup.id, confirm })).rejects.toThrow(/Type DELETE/);
      }
      await expect(reset.restoreBackup({ backupId: backup.id, confirm: 'DELETE' })).rejects.toThrow(/Type RESTORE/);
      await untouched();
    }, 60_000);

    it('needs a real, recent backup that covers the data', async () => {
      const del = (backupId: string) => reset.deleteSelectedData({ groupIds: ['customers'], backupId, confirm: 'DELETE' });
      await expect(del('')).rejects.toThrow(/not a valid backup/);
      await expect(del('../../etc/passwd')).rejects.toThrow(/not a valid backup/);
      await expect(del(rowId('no-such-backup', 1))).rejects.toThrow(/could not be found/);

      const stale = await reset.createBackup({ groupIds: ['customers'] });
      const manifest = backupFile(stale.id, 'manifest.json');
      const m = JSON.parse(readFileSync(manifest, 'utf8'));
      writeFileSync(manifest, JSON.stringify({ ...m, createdAt: new Date(Date.now() - 61 * 60_000).toISOString() }));
      await expect(del(stale.id)).rejects.toThrow(/more than an hour old/);

      const covered = await reset.createBackup({ groupIds: ['customers'] });
      await db.$executeRawUnsafe(`INSERT INTO mis_customers (id, code, name, updated_at) VALUES ($1::uuid, 'LATE', 'Added after the backup', now())`, rowId('late', 1));
      await expect(del(covered.id)).rejects.toThrow(/changed since that backup/);
      expect(await rowCount('mis_customers')).toBe(3);
    }, 60_000);

    it('refuses every role but Owner, and anyone not signed in', async () => {
      const backup = await reset.createBackup({ groupIds: ['customers'] });
      const staff = rowId('mis_employees', 4);
      const roles = await db.$queryRawUnsafe<{ r: string }[]>(`SELECT e.enumlabel::text AS r FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'MisRole'`);
      expect(roles.length).toBeGreaterThan(5);
      const calls = () => [
        reset.getDangerZoneOverview(),
        reset.previewDelete({ groupIds: ['customers'] }),
        reset.createBackup({ groupIds: ['customers'] }),
        reset.getBackupDownload({ backupId: backup.id, kind: 'json' }),
        reset.deleteSelectedData({ groupIds: ['customers'], backupId: backup.id, confirm: 'DELETE' }),
        reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' }),
      ];
      signedIn = STAFF_USER;
      for (const { r } of roles.filter((x) => x.r !== 'OWNER')) {
        await db.$executeRawUnsafe(`UPDATE mis_employees SET role = $1::text::"MisRole" WHERE id = $2::uuid`, r, staff);
        for (const call of calls()) await expect(call, r).rejects.toThrow(/Not permitted: data.reset/);
      }
      signedIn = null;
      for (const call of calls()) await expect(call).rejects.toThrow(/Not permitted: data.reset/);
      await untouched();
    }, 60_000);
  });

  // Its own describe, not its own file: two files seeding this one database at once would wipe each other's rows.
  describe('R8 follow-up: stock books and kept staff', () => {
    const STOCK_TABLES = [
      'mis_inventory_ledger', 'mis_store_transactions', 'mis_store_returns', 'mis_physical_counts', 'mis_order_stock_allocations', 'mis_quarantine_stock',
      'mis_material_requests', 'mis_material_request_lines', 'mis_pick_lists', 'mis_pick_list_lines',
    ];
    const EVER = { from: new Date('2020-01-01'), to: new Date('2099-01-01') };
    const item = rowId('mis_items', 2);
    let inventory: typeof import('./inventory');
    let store: typeof import('./store');
    let reports: typeof import('./reports');
    let legacy: typeof import('./legacy-issues');
    let earmarks: typeof import('./order-allocation');
    let returns: typeof import('./store-return');

    const clear = async (ids: ResetGroupId[]) => {
      const backup = await reset.createBackup({ groupIds: ids });
      await reset.deleteSelectedData({ groupIds: ids, backupId: backup.id, confirm: 'DELETE' });
      return backup;
    };

    /** Every figure a person can read about stock, by where they read it. */
    async function stockViews(): Promise<Record<string, number[]>> {
      const dash = await store.getStoreDashboard();
      return {
        'inventory page': (await inventory.getInventoryPage()).rows.map((r) => r.balance),
        'inventory summary': (await inventory.getInventorySummary()).map((r) => r.balance),
        'item balance': [(await inventory.getInventoryBalance(item)).balance],
        'item ledger': (await inventory.listInventoryLedger(item)).map((r) => r.balanceQty.toNumber()),
        'store items': (await store.listStoreItems()).map((r) => r.stockBalance),
        'stock list': (await store.listStockSummary()).flatMap((r) => [r.stockBalance, r.stockValue ?? 0]),
        'stock list page': (await store.listStockSummaryPage()).rows.flatMap((r) => [r.stockBalance, r.stockValue ?? 0]),
        'item transactions': (await store.listStoreTxns(item)).map((r) => r.balanceQty),
        'all transactions': (await store.listAllStoreTxns()).map((r) => r.balanceQty),
        'transactions page': (await store.listAllStoreTxnsPage()).rows.map((r) => r.balanceQty),
        'physical counts': (await store.listPhysicalCounts()).map((r) => r.systemQty),
        'picker': (await store.listPickerItems()).map((r) => r.balance),
        'cart balances': Object.values(await store.listItemBalances()),
        'store report': (await reports.getStoreReport(EVER)).rows.flatMap((r) => [r.totalIn, r.totalOut]),
        'legacy issues': (await legacy.listLegacyStoreIssues()).map((r) => r.balanceAfter),
        'order earmarks': Object.values(await earmarks.listOpenOrderAllocations()).flat().map((r) => r.allocated),
        'store returns': (await returns.listStoreReturns()).map((r) => r.quantity.toNumber()),
        'store dashboard': [dash.todayIn, dash.todayOut, dash.totalStockValue ?? 0, ...dash.recentTxns.map((t) => t.balanceQty)],
      };
    }

    beforeAll(async () => {
      inventory = await import('./inventory');
      store = await import('./store');
      reports = await import('./reports');
      legacy = await import('./legacy-issues');
      earmarks = await import('./order-allocation');
      returns = await import('./store-return');
    });

    beforeEach(async () => {
      // Row 1 of the dummy world fills every column, deleted_at included. Stock must show before it can be proved gone.
      await db.$executeRawUnsafe(`UPDATE mis_items SET deleted_at = NULL, is_active = true, price_per_unit = 5`);
      await db.$executeRawUnsafe(`UPDATE mis_orders SET status = 'CONFIRMED'`);
      await db.$executeRawUnsafe(`UPDATE mis_store_transactions SET type = 'IN', created_at = now()`);
      await db.$executeRawUnsafe(`UPDATE mis_inventory_ledger SET source = 'STORE_ISSUE', source_id = NULL WHERE source = 'OPENING'`);
    });

    describe.each<[string, ResetGroupId[]]>([
      ['customers', ['customers']],
      ['orders', ['orders']],
      ['purchasing', ['purchasing']],
      ['inventory', ['inventory']],
      ['clear-all', ALL_GROUPS],
    ])('%s', (_name, ids) => {
      it('the tree lists the books, every stock figure then reads 0, and a restore brings each one back', async () => {
        const before = await stockViews();
        for (const [view, figures] of Object.entries(before)) expect(figures.filter((n) => n !== 0).length, `${view} shows stock first`).toBeGreaterThan(0);
        const rows = await snapshotRows(db, compared());

        const { tree } = await reset.previewDelete({ groupIds: ids });
        for (const t of STOCK_TABLES) expect(tree.find((r) => r.name === t)?.rows, t).toBeGreaterThan(0);

        const backup = await clear(ids);
        for (const t of STOCK_TABLES) expect(await rowCount(t), t).toBe(0);
        for (const [view, figures] of Object.entries(await stockViews())) expect(figures.filter((n) => n !== 0), view).toEqual([]);

        await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
        expect(await stockViews()).toEqual(before);
        expect(await snapshotRows(db, compared())).toEqual(rows);
      }, 60_000);
    });

    it('the item list stays and shows 0, not blank, when only the books go', async () => {
      await clear(['purchasing']);
      expect((await inventory.getInventoryPage()).rows.map((r) => r.balance)).toEqual([0, 0]);
      expect((await inventory.getInventoryPage()).outOfStock).toBe(2);
      expect((await store.getStoreDashboard()).outOfStockCount).toBe(2);
    }, 60_000);

    it('both books start again from 0 after a clear, and agree', async () => {
      await clear(['purchasing']);
      await inventory.adjustInventory(item, 7, 'first stock after the clear');
      expect((await inventory.getInventoryBalance(item)).balance).toBe(7);
      expect((await store.listStockSummary()).find((r) => r.id === item)?.stockBalance).toBe(7);
    }, 60_000);

    it.each<ResetGroupId>(['production', 'stages', 'machine_allocation', 'attendance', 'finance', 'employees'])('%s leaves the stock books alone', async (id) => {
      const before = await snapshotRows(db, STOCK_TABLES);
      await clear([id]);
      expect(await snapshotRows(db, STOCK_TABLES)).toEqual(before);
    }, 60_000);

    describe('Employees and worker allocations', () => {
      const [cleared, kept] = [rowId('mis_worker_allocations', 1), rowId('mis_worker_allocations', 2)];
      const allocations = async () => (await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id::text FROM mis_worker_allocations ORDER BY id`)).map((r) => r.id);

      beforeEach(async () => {
        await db.$executeRawUnsafe(`UPDATE mis_worker_allocations SET employee_id = $1::uuid WHERE id = $2::uuid`, rowId('mis_employees', 3), kept);
      });

      it("a clear takes only removed people's rows, says so in the tree, and a restore puts them back", async () => {
        const rows = await snapshotRows(db, compared());
        const { tree } = await reset.previewDelete({ groupIds: ['employees'] });
        expect(tree.find((r) => r.name === 'mis_worker_allocations')?.rows).toBe(1);

        const backup = await reset.createBackup({ groupIds: ['employees'] });
        const { perTable } = await reset.deleteSelectedData({ groupIds: ['employees'], backupId: backup.id, confirm: 'DELETE' });
        expect(perTable.mis_worker_allocations).toBe(1);
        expect(await allocations()).toEqual([kept]);
        expect(await allocations()).not.toContain(cleared);

        await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
        expect(await snapshotRows(db, compared())).toEqual(rows);
      }, 60_000);

      it.each<[string, ResetGroupId[]]>([
        ['the allocation group', ['employees', 'machine_allocation']],
        ['a clear that reaches them through orders', ['employees', 'customers']],
      ])('with %s selected too, every row goes', async (_name, ids) => {
        await clear(ids);
        expect(await allocations()).toEqual([]);
      }, 60_000);
    });
  });

  it('the storage layer in use here is the local throwaway folder', () => {
    expect(storage.getStorageDriverName()).toBe('local');
  });
});
