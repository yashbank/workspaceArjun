// @vitest-environment node
import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getDriver } from '@/server/storage/driver';

import { OWNER_USER, misTables, seedWorld, snapshotRows } from './testing/data-reset-world';

/**
 * Backup, download and restore through the real bucket (`local-db.sh vitest-s3`). Dummy rows from the throwaway DB only.
 * Every storage call is fenced to data-reset/backups/, so the shared index and all other prefixes are never written, and
 * only the keys this test uploaded are deleted.
 */
const isLocal = (url: string) => new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname === '127.0.0.1';
const urls = [process.env.DATABASE_URL, process.env.DIRECT_URL, process.env.RUNTIME_DATABASE_URL].filter((u): u is string => !!u);
const REAL_BUCKET = !!process.env.DATABASE_URL && urls.every(isLocal) && getDriver() === 's3';

const uploaded = new Set<string>();
const INDEX_KEY = 'data-reset/index.json';
const fence = (key: string) => {
  if (!/^data-reset\/backups\/[0-9a-f-]{36}\/[^/]+$/.test(key)) throw new Error(`Outside the test's prefix: ${key}`);
  return key;
};

vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: OWNER_USER }) }));
vi.mock('@/server/storage', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/server/storage')>();
  return {
    ...real,
    putObject: async (key: string, body: Uint8Array, type: string) => {
      if (key === INDEX_KEY) return; // the real list of the Owner's backups stays as it is
      uploaded.add(fence(key));
      return real.putObject(key, body, type);
    },
    getObject: async (key: string) => {
      // A key that never exists, so readIndex meets the bucket's real missing-key error, not a stub's.
      if (key === INDEX_KEY) return real.getObject('data-reset/backups/00000000-0000-0000-0000-000000000000/index.json');
      return real.getObject(fence(key));
    },
  };
});

describe.skipIf(!REAL_BUCKET)('Danger Zone on the real bucket', () => {
  let storage: typeof import('@/server/storage');
  const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

  beforeAll(async () => {
    storage = await import('@/server/storage');
  });

  afterAll(async () => {
    const keys = [...uploaded].map(fence);
    for (const k of keys) await storage.deleteObject(k); // not deleteObjects: that one swallows failures
    const left = await Promise.all(keys.map(async (k) => ((await storage.headObject(k)).exists ? k : null)));
    console.log(`[s3-proof] uploaded ${keys.length}, still present after cleanup ${left.filter(Boolean).length}`);
    expect(left.filter(Boolean)).toEqual([]);
  }, 120_000);

  it('uploads, reads back, downloads by signed link, refuses tampering and restores', async () => {
    const { db } = await import('@/server/db');
    const reset = await import('./data-reset');
    const [{ addr }] = await db.$queryRawUnsafe<{ addr: string }[]>(`SELECT host(inet_server_addr()) AS addr`);
    expect(addr).toBe('127.0.0.1');
    expect(storage.getStorageDriverName()).toBe('s3');

    await seedWorld(db);
    const tables = (await misTables(db)).filter((t) => t !== 'mis_audit_logs');
    const before = await snapshotRows(db, tables);

    const backup = await reset.createBackup({ groupIds: ['customers'] });
    const key = (file: string) => `data-reset/backups/${backup.id}/${file}`;
    const manifest = JSON.parse(new TextDecoder().decode((await storage.getObject(key('manifest.json'))).bytes));
    expect(Object.keys(manifest.checksums)).toContain(`${backup.name}.csv.zip`);

    for (const [kind, file] of [['json', `${backup.name}.json`], ['csv', `${backup.name}.csv.zip`]]) {
      const link = await reset.getBackupDownload({ backupId: backup.id, kind });
      if (!('url' in link)) throw new Error('expected a signed link on object storage');
      const res = await fetch(link.url);
      expect(res.status).toBe(200);
      expect(sha(new Uint8Array(await res.arrayBuffer()))).toBe(manifest.checksums[file]);
    }

    const original = (await storage.getObject(key('mis_customers.json'))).bytes;
    await storage.putObject(key('mis_customers.json'), new TextEncoder().encode('[]'), 'application/json');
    await expect(reset.deleteSelectedData({ groupIds: ['customers'], backupId: backup.id, confirm: 'DELETE' })).rejects.toThrow(/could not be verified/);
    await storage.putObject(key('mis_customers.json'), original, 'application/json');

    await reset.deleteSelectedData({ groupIds: ['customers'], backupId: backup.id, confirm: 'DELETE' });
    expect((await snapshotRows(db, ['mis_customers'])).mis_customers).toEqual([]);
    await reset.restoreBackup({ backupId: backup.id, confirm: 'RESTORE' });
    expect(await snapshotRows(db, tables)).toEqual(before);
  }, 400_000);
});
