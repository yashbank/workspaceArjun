// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A restore over stock posted since a clear, on a real Postgres. data-reset.integration.test.ts seeds the public tables,
 * and vitest runs files side by side, so this file works on its own copy of them in a private schema: every statement in
 * data-reset.ts is unqualified, so the search_path decides. Only the sign-in gate and the audit write are mocked.
 */
const SCHEMA = 'dz_restore_books';
process.env.PGOPTIONS = `-c search_path=${SCHEMA},public`;
const isLocal = (url: string) => new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname === '127.0.0.1';
const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL, process.env.RUNTIME_DATABASE_URL].filter((u): u is string => !!u);
const LOCAL_DB = !!process.env.DATABASE_URL && urls.every(isLocal) && process.env.STORAGE_DRIVER === 'local';

vi.mock('./auth', () => ({ requirePermission: async () => ({ userId: 'owner', role: 'OWNER' }) }));
vi.mock('./audit', () => ({ logAuditEvent: async () => {} }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ITEM = uuid(1);

describe.skipIf(!LOCAL_DB)('a restore never merges two stock histories', () => {
  let db: Awaited<typeof import('@/server/db')>['db'];
  let reset: typeof import('./data-reset');
  let root: string;

  const ledgerRow = (n: number, balance: number, at: string) =>
    db.$executeRawUnsafe(`INSERT INTO mis_inventory_ledger (id, item_id, change_qty, balance_qty, source, created_at) VALUES ($1::uuid, $2::uuid, 1, $3, 'STORE_ISSUE', $4::timestamptz)`, uuid(100 + n), ITEM, balance, at);
  const txnRow = (n: number, balance: number, at: string) =>
    db.$executeRawUnsafe(`INSERT INTO mis_store_transactions (id, txn_number, item_id, type, quantity, balance_qty, created_at) VALUES ($1::uuid, $2, $3::uuid, 'IN', 1, $4, $5::timestamptz)`, uuid(200 + n), `T-${n}`, ITEM, balance, at);
  const ids = async (t: string) => (await db.$queryRawUnsafe<{ id: string }[]>(`SELECT id::text FROM "${t}" ORDER BY id`)).map((r) => r.id);
  const clear = async () => {
    const backup = await reset.createBackup({ groupIds: ['inventory'] });
    await reset.deleteSelectedData({ groupIds: ['inventory'], backupId: backup.id, confirm: 'DELETE' });
    return backup;
  };

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'bpp-restore-books-'));
    process.env.LOCAL_STORAGE_PATH = root;
    ({ db } = await import('@/server/db'));
    reset = await import('./data-reset');
    const [{ addr }] = await db.$queryRawUnsafe<{ addr: string }[]>(`SELECT host(inet_server_addr()) AS addr`);
    expect(addr).toBe('127.0.0.1');
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db.$executeRawUnsafe(`CREATE SCHEMA ${SCHEMA}`);
    const tables = await db.$queryRawUnsafe<{ t: string }[]>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'mis\\_%'`);
    for (const { t } of tables) await db.$executeRawUnsafe(`CREATE TABLE ${SCHEMA}."${t}" (LIKE public."${t}" INCLUDING ALL)`);
  }, 60_000);

  beforeEach(async () => {
    await db.$executeRawUnsafe(`TRUNCATE mis_inventory_ledger, mis_store_transactions`);
    await ledgerRow(1, 10, '2026-01-01T00:00:00Z');
    await txnRow(1, 10, '2026-01-01T00:00:00Z');
  });

  afterAll(async () => {
    if (db) await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    if (root) rmSync(root, { recursive: true, force: true });
    delete process.env.PGOPTIONS;
  });

  it('refuses by name when the ledger holds rows posted since the clear, and changes nothing', async () => {
    const backup = await clear();
    await ledgerRow(2, 3, '2026-02-01T00:00:00Z');
    const attempt = reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
    await expect(attempt).rejects.toThrow(reset.DataResetError);
    await expect(attempt).rejects.toThrow(/mis_inventory_ledger/);
    expect(await ids('mis_inventory_ledger')).toEqual([uuid(102)]);
    expect(await ids('mis_store_transactions')).toEqual([]);
  }, 60_000);

  it('refuses by name when only the store transactions hold rows posted since the clear', async () => {
    const backup = await clear();
    await txnRow(2, 3, '2026-02-01T00:00:00Z');
    const attempt = reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
    await expect(attempt).rejects.toThrow(reset.DataResetError);
    await expect(attempt).rejects.toThrow(/mis_store_transactions/);
    expect(await ids('mis_inventory_ledger')).toEqual([]);
  }, 60_000);

  it('restores empty books, and running it twice is still safe', async () => {
    const backup = await clear();
    await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
    await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
    expect(await ids('mis_inventory_ledger')).toEqual([uuid(101)]);
    expect(await ids('mis_store_transactions')).toEqual([uuid(201)]);
  }, 60_000);

  it('a restore with nothing cleared is not refused for rows posted since the backup: no chain is touched', async () => {
    const backup = await reset.createBackup({ groupIds: [] });
    await ledgerRow(2, 3, '2026-02-01T00:00:00Z');
    await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
    expect(await ids('mis_inventory_ledger')).toEqual([uuid(101), uuid(102)]);
  }, 60_000);
});
