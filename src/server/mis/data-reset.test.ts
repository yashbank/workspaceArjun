import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, Uint8Array>();
const brokenKeys = new Map<string, Error>();
const sql: string[] = [];
const auditLog = vi.fn();
const requirePermission = vi.fn(async () => ({ userId: 'owner-1' }));

// Two tables: orders point at customers through a set-null link, the case the owner hit.
const tx = {
  $queryRawUnsafe: vi.fn(async (q: string) => {
    if (q.includes('pg_class c JOIN')) return [{ relname: 'mis_customers' }, { relname: 'mis_orders' }];
    if (q.includes("c.contype = 'f' AND n.nspname")) return [{ child: 'mis_orders', parent: 'mis_customers' }];
    if (q.includes('jsonb_agg')) return [{ j: '[{"id":1,"amount":12.3456789012345678}]', n: 1 }];
    if (q.includes('count(*)')) return [{ n: 1 }];
    return [];
  }),
  $executeRawUnsafe: vi.fn(async (q: string) => {
    sql.push(q);
    return 1;
  }),
};

vi.mock('@/server/db', () => ({ db: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } }));
vi.mock('./auth', () => ({ requirePermission: (a: string) => (requirePermission as (x: string) => unknown)(a) }));
vi.mock('./audit', () => ({ logAuditEvent: (e: unknown) => auditLog(e) }));
vi.mock('@/server/storage', () => ({
  getStorageDriverName: () => 'local',
  createPresignedGetUrl: vi.fn(),
  putObject: async (key: string, bytes: Uint8Array) => void store.set(key, bytes),
  getObject: async (key: string) => {
    const broken = brokenKeys.get(key);
    if (broken) throw broken;
    const bytes = store.get(key);
    if (!bytes) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return { bytes, contentType: 'application/json' };
  },
}));

const { createBackup, deleteSelectedData, getBackupDownload, previewDelete, restoreBackup } = await import('./data-reset');

const keys = () => [...store.keys()];
const deletes = () => sql.filter((q) => q.startsWith('DELETE'));

beforeEach(() => {
  store.clear();
  brokenKeys.clear();
  sql.length = 0;
  vi.clearAllMocks();
});

describe('backup', () => {
  it('writes JSON and a CSV zip under the required name, with checksums that match storage', async () => {
    const b = await createBackup({ groupIds: ['customers'] });
    expect(b.name).toMatch(/^bpp-backup-customers-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}$/);
    expect(keys()).toContain(`data-reset/backups/${b.id}/${b.name}.json`);
    expect(keys()).toContain(`data-reset/backups/${b.id}/${b.name}.csv.zip`);
    const manifest = JSON.parse(new TextDecoder().decode(store.get(`data-reset/backups/${b.id}/manifest.json`)));
    for (const [file, sum] of Object.entries(manifest.checksums)) {
      expect(createHash('sha256').update(store.get(`data-reset/backups/${b.id}/${file}`)!).digest('hex')).toBe(sum);
    }
  });

  it('keeps raw numbers exactly in the downloadable JSON', async () => {
    const b = await createBackup();
    const text = new TextDecoder().decode(store.get(`data-reset/backups/${b.id}/${b.name}.json`));
    expect(text).toContain('12.3456789012345678');
    expect(JSON.parse(text).format).toBe('mis-backup-v1');
  });

  it('the download is Owner-gated and audited', async () => {
    const b = await createBackup();
    const file = await getBackupDownload({ backupId: b.id, kind: 'csv' });
    expect(requirePermission).toHaveBeenLastCalledWith('data.reset');
    expect('fileName' in file && file.fileName).toBe(`${b.name}.csv.zip`);
    expect(auditLog).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'data.backup.download' }));
    await expect(getBackupDownload({ backupId: b.id, kind: '../x' })).rejects.toThrow('not a valid backup');
  });
});

describe('the backup index', () => {
  const INDEX = 'data-reset/index.json';
  const index = () => JSON.parse(new TextDecoder().decode(store.get(INDEX)));

  it('a missing index, on disk or in a bucket, is an empty list', async () => {
    await createBackup();
    expect(index()).toHaveLength(1);
    store.delete(INDEX);
    brokenKeys.set(INDEX, Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } }));
    await createBackup();
    expect(index()).toHaveLength(1);
  });

  it('a storage failure stops the backup and leaves older entries in place', async () => {
    const first = await createBackup();
    brokenKeys.set(INDEX, Object.assign(new Error('socket hang up'), { name: 'TimeoutError' }));
    await expect(createBackup()).rejects.toThrow(/backup list could not be read/);
    brokenKeys.clear();
    expect(index().map((b: { id: string }) => b.id)).toEqual([first.id]);
  });

  it('an unreadable index is not overwritten either', async () => {
    await createBackup();
    store.set(INDEX, new TextEncoder().encode('{not json'));
    await expect(createBackup()).rejects.toThrow(/backup list could not be read/);
    expect(new TextDecoder().decode(store.get(INDEX))).toBe('{not json');
  });
});

describe('delete', () => {
  it('preview shows the dependents as a tree with counts', async () => {
    const p = await previewDelete({ groupIds: ['customers'] });
    expect(p.tree).toEqual([
      { name: 'mis_customers', rows: 1, depth: 0 },
      { name: 'mis_orders', rows: 1, depth: 1 },
    ]);
  });

  it('deletes children before parents, and audits', async () => {
    const b = await createBackup();
    await deleteSelectedData({ groupIds: ['customers'], backupId: b.id, confirm: 'DELETE' });
    expect(deletes()).toEqual(['DELETE FROM "mis_orders"', 'DELETE FROM "mis_customers"']);
    expect(auditLog).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'data.delete', severity: 'WARNING' }));
  });

  it('refuses without the typed word', async () => {
    const b = await createBackup();
    await expect(deleteSelectedData({ groupIds: ['customers'], backupId: b.id, confirm: 'delete' })).rejects.toThrow('Type DELETE');
    expect(deletes()).toEqual([]);
  });

  it('refuses and deletes nothing when a backup file no longer matches its checksum', async () => {
    const b = await createBackup();
    store.set(`data-reset/backups/${b.id}/mis_orders.json`, new TextEncoder().encode('[]'));
    await expect(deleteSelectedData({ groupIds: ['customers'], backupId: b.id, confirm: 'DELETE' })).rejects.toThrow('could not be verified');
    expect(deletes()).toEqual([]);
  });

  it('refuses a backup with no checksums', async () => {
    const b = await createBackup();
    const key = `data-reset/backups/${b.id}/manifest.json`;
    const { checksums: _dropped, ...old } = JSON.parse(new TextDecoder().decode(store.get(key)));
    store.set(key, new TextEncoder().encode(JSON.stringify(old)));
    await expect(deleteSelectedData({ groupIds: ['customers'], backupId: b.id, confirm: 'DELETE' })).rejects.toThrow('no checksums');
  });
});

describe('restore', () => {
  it('puts parents back before children', async () => {
    const b = await createBackup();
    await restoreBackup({ backupId: b.id, confirm: 'RESTORE' });
    expect(sql.filter((q) => q.startsWith('INSERT')).map((q) => q.split('"')[1])).toEqual(['mis_customers', 'mis_orders']);
  });

  it('refuses a damaged backup before changing anything', async () => {
    const b = await createBackup();
    store.set(`data-reset/backups/${b.id}/mis_customers.json`, new TextEncoder().encode('[]'));
    await expect(restoreBackup({ backupId: b.id, confirm: 'RESTORE' })).rejects.toThrow('could not be verified');
    expect(sql).toEqual([]);
  });
});
