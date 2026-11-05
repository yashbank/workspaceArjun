import { randomUUID } from 'node:crypto';

import type { Prisma } from '@/generated/prisma/client';
import {
  BACKUP_EXCLUDED_TABLES,
  CONFIRM_DELETE_WORD,
  CONFIRM_RESTORE_WORD,
  EMPLOYEE_KEEP_WHERE,
  PROTECTED_TABLES,
  RESET_GROUPS,
  checkBackupCoversDelete,
  expandGroups,
  isResetGroupId,
  isSafeTableName,
  orderParentsFirst,
  tablesForGroups,
  totalRows,
  type FkEdge,
  type ResetGroupId,
} from '@/lib/mis/data-reset-groups';
import { isUuid } from '@/lib/mis/ids';
import { db } from '@/server/db';
import { getObject, getStorageDriverName, putObject } from '@/server/storage';

import { logAuditEvent } from './audit';
import { requirePermission } from './auth';

/**
 * Owner Danger Zone: back up, clear, and restore MIS data.
 *
 * SAFETY RULES (each one is pinned by data-reset.test.ts):
 *   1. Every exported function opens with requirePermission('data.reset'), which only OWNER holds.
 *   2. Nothing is deleted without a backup taken in the last hour, and nothing is deleted if a selected table has MORE
 *      rows now than the backup has (that would mean data the backup does not hold).
 *   3. The delete runs in ONE transaction with the tables locked. If the database refuses any step, nothing is deleted.
 *   4. Sign-in accounts, Owner/Admin employees, the audit log, paired tablets and settings/masters are never deleted.
 *   5. A restore only ADDS back rows that are missing (ON CONFLICT DO NOTHING) and refills links that were blanked by
 *      the delete. It never overwrites or removes anything, so it is safe to run twice.
 *   6. In production, backups must go to real object storage; the local-disk driver is refused there.
 */

export class DataResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataResetError';
  }
}

type Tx = Prisma.TransactionClient;

const PREFIX = 'data-reset';
const INDEX_KEY = `${PREFIX}/index.json`;
const JSON_TYPE = 'application/json';

export type BackupSummary = { id: string; createdAt: string; createdBy: string; totalRows: number };
type Manifest = BackupSummary & { counts: Record<string, number> };

const q = (t: string) => `"${t}"`;
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

// ---------------------------------------------------------------------------
// helpers (not exported: every exported function below is gated)
// ---------------------------------------------------------------------------

function assertStorageIsSafe() {
  if (process.env.NODE_ENV === 'production' && getStorageDriverName() === 'local') {
    throw new DataResetError('Backups need real file storage, and this server only has temporary disk. Ask your developer to configure storage.');
  }
}

async function dataTables(tx: Tx): Promise<string[]> {
  const rows = await tx.$queryRawUnsafe<{ relname: string }[]>(
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'mis\\_%' ORDER BY c.relname`,
  );
  return rows.map((r) => r.relname).filter((t) => isSafeTableName(t) && !BACKUP_EXCLUDED_TABLES.includes(t));
}

type FkRow = { child: string; parent: string; del: string };
async function foreignKeys(tx: Tx): Promise<FkRow[]> {
  return tx.$queryRawUnsafe<FkRow[]>(
    `SELECT cl.relname AS child, pl.relname AS parent, c.confdeltype::text AS del
     FROM pg_constraint c
     JOIN pg_class cl ON cl.oid = c.conrelid
     JOIN pg_class pl ON pl.oid = c.confrelid
     JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE c.contype = 'f' AND n.nspname = 'public'`,
  );
}

const edgesOf = (fks: FkRow[]): FkEdge[] => fks.map((f) => ({ child: f.child, parent: f.parent }));

async function count(tx: Tx, table: string): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${q(table)}`);
  return rows[0]?.n ?? 0;
}

async function countsFor(tx: Tx, tables: readonly string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = await count(tx, t);
  return out;
}

/** The selected tables plus every table whose rows would block (or be removed with) them. Children come first. */
async function planDelete(tx: Tx, groupIds: readonly ResetGroupId[]) {
  const present = new Set(await dataTables(tx));
  const roots = tablesForGroups(groupIds);
  for (const t of roots) {
    if (!present.has(t)) throw new DataResetError(`Table ${t} was not found in the database. Nothing was changed.`);
  }
  const fks = await foreignKeys(tx);
  const set = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of fks) {
      // a = no action, r = restrict, c = cascade: the child must go too. n = set null: the child stays.
      if (!['a', 'r', 'c'].includes(f.del)) continue;
      if (set.has(f.parent) && !set.has(f.child) && f.child !== f.parent) {
        set.add(f.child);
        grew = true;
      }
    }
  }
  for (const t of set) {
    if (!t.startsWith('mis_') || PROTECTED_TABLES.includes(t) || !isSafeTableName(t)) {
      throw new DataResetError(`Clearing this would also touch ${t}, which is protected. Nothing was changed.`);
    }
  }
  const parentsFirst = orderParentsFirst([...set], edgesOf(fks));
  return { tables: parentsFirst.reverse(), roots }; // children first
}

async function readIndex(): Promise<BackupSummary[]> {
  try {
    const { bytes } = await getObject(INDEX_KEY);
    return JSON.parse(dec(bytes)) as BackupSummary[];
  } catch {
    return [];
  }
}

async function readManifest(id: string): Promise<Manifest> {
  if (!isUuid(id)) throw new DataResetError('That is not a valid backup.');
  try {
    const { bytes } = await getObject(`${PREFIX}/backups/${id}/manifest.json`);
    return JSON.parse(dec(bytes)) as Manifest;
  } catch {
    throw new DataResetError('That backup could not be found.');
  }
}

// ---------------------------------------------------------------------------
// exported, gated
// ---------------------------------------------------------------------------

export async function getDangerZoneOverview() {
  await requirePermission('data.reset');
  const counts = await db.$transaction((tx) => countsFor(tx, tablesForGroups(RESET_GROUPS.map((g) => g.id))));
  const groups = RESET_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    description: g.description,
    requires: g.requires,
    rows: expandGroups([g.id]).reduce((sum, gid) => {
      const grp = RESET_GROUPS.find((x) => x.id === gid)!;
      return sum + grp.tables.reduce((s, t) => s + (counts[t] ?? 0), 0);
    }, 0),
  }));
  const storageOk = !(process.env.NODE_ENV === 'production' && getStorageDriverName() === 'local');
  return { groups, backups: (await readIndex()).slice().reverse(), storageOk };
}

export async function previewDelete(input: { groupIds: string[] }) {
  await requirePermission('data.reset');
  const ids = input.groupIds.filter(isResetGroupId);
  if (ids.length === 0) throw new DataResetError('Choose at least one kind of data.');
  return db.$transaction(async (tx) => {
    const plan = await planDelete(tx, expandGroups(ids));
    const counts = await countsFor(tx, plan.tables);
    return {
      groups: expandGroups(ids),
      tables: plan.tables.map((name) => ({ name, rows: counts[name] ?? 0 })).filter((t) => t.rows > 0),
    };
  });
}

export async function createBackup() {
  const actor = await requirePermission('data.reset');
  assertStorageIsSafe();
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  // One consistent snapshot: every table is read inside a single repeatable-read transaction.
  const snapshot = await db.$transaction(
    async (tx) => {
      const out: Record<string, { json: string; n: number }> = {};
      for (const t of await dataTables(tx)) {
        const rows = await tx.$queryRawUnsafe<{ j: string; n: number }[]>(
          `SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)::text AS j, count(*)::int AS n FROM ${q(t)} x`,
        );
        out[t] = { json: rows[0].j, n: rows[0].n };
      }
      return out;
    },
    { isolationLevel: 'RepeatableRead', timeout: 120_000, maxWait: 20_000 },
  );

  // Raw JSON text is stored as is, never parsed, so money and dates come back exactly as they went in.
  for (const [t, v] of Object.entries(snapshot)) {
    await putObject(`${PREFIX}/backups/${id}/${t}.json`, enc(v.json), JSON_TYPE);
  }
  const counts = Object.fromEntries(Object.entries(snapshot).map(([t, v]) => [t, v.n]));
  const manifest: Manifest = { id, createdAt, createdBy: actor.userId, totalRows: totalRows(counts), counts };
  await putObject(`${PREFIX}/backups/${id}/manifest.json`, enc(JSON.stringify(manifest)), JSON_TYPE);

  // Prove it: read every file back and compare it with what was written.
  for (const [t, v] of Object.entries(snapshot)) {
    const back = dec((await getObject(`${PREFIX}/backups/${id}/${t}.json`)).bytes);
    if (back !== v.json) throw new DataResetError(`The backup could not be verified (${t}). Nothing was deleted. Try again.`);
  }

  const summary: BackupSummary = { id, createdAt, createdBy: actor.userId, totalRows: manifest.totalRows };
  await putObject(INDEX_KEY, enc(JSON.stringify([...(await readIndex()), summary])), JSON_TYPE);
  await logAuditEvent({ actorId: actor.userId, action: 'data.backup', entity: 'data-reset', entityId: id, after: { totalRows: manifest.totalRows, tables: Object.keys(counts).length } });
  return summary;
}

export async function deleteSelectedData(input: { groupIds: string[]; backupId: string; confirm: string }) {
  const actor = await requirePermission('data.reset');
  if (input.confirm !== CONFIRM_DELETE_WORD) throw new DataResetError(`Type ${CONFIRM_DELETE_WORD} to confirm.`);
  const ids = input.groupIds.filter(isResetGroupId);
  if (ids.length === 0) throw new DataResetError('Choose at least one kind of data.');
  const manifest = await readManifest(input.backupId);

  const deleted = await db.$transaction(
    async (tx) => {
      const plan = await planDelete(tx, expandGroups(ids));
      // Block writers while we check and delete, so the check below stays true until the delete is done.
      for (const t of plan.tables) await tx.$executeRawUnsafe(`LOCK TABLE ${q(t)} IN EXCLUSIVE MODE`);
      const current = await countsFor(tx, plan.tables);
      const verdict = checkBackupCoversDelete({
        backupCreatedAt: new Date(manifest.createdAt),
        now: new Date(),
        backupCounts: manifest.counts,
        currentCounts: current,
        tables: plan.tables,
      });
      if (!verdict.ok) throw new DataResetError(verdict.reason);
      const removed: Record<string, number> = {};
      for (const t of plan.tables) {
        const where = t === 'mis_employees' ? ` WHERE ${EMPLOYEE_KEEP_WHERE}` : '';
        removed[t] = await tx.$executeRawUnsafe(`DELETE FROM ${q(t)}${where}`);
      }
      return removed;
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  await logAuditEvent({
    actorId: actor.userId,
    action: 'data.delete',
    entity: 'data-reset',
    entityId: input.backupId,
    severity: 'WARNING',
    after: { groups: expandGroups(ids), rowsDeleted: totalRows(deleted), perTable: deleted },
  });
  return { rowsDeleted: totalRows(deleted), perTable: deleted };
}

export async function restoreBackup(input: { backupId: string; confirm: string }) {
  const actor = await requirePermission('data.reset');
  if (input.confirm !== CONFIRM_RESTORE_WORD) throw new DataResetError(`Type ${CONFIRM_RESTORE_WORD} to confirm.`);
  const manifest = await readManifest(input.backupId);

  // Read every table file first, so a missing file stops us before anything changes.
  const files: Record<string, string> = {};
  for (const t of Object.keys(manifest.counts)) {
    if (!isSafeTableName(t) || BACKUP_EXCLUDED_TABLES.includes(t)) continue;
    if (manifest.counts[t] === 0) continue;
    files[t] = dec((await getObject(`${PREFIX}/backups/${manifest.id}/${t}.json`)).bytes);
  }

  const inserted = await db.$transaction(
    async (tx) => {
      const present = new Set(await dataTables(tx));
      const tables = Object.keys(files).filter((t) => present.has(t));
      const fks = await foreignKeys(tx);
      const added: Record<string, number> = {};
      for (const t of orderParentsFirst(tables, edgesOf(fks))) {
        added[t] = await tx.$executeRawUnsafe(
          `INSERT INTO ${q(t)} SELECT * FROM jsonb_populate_recordset(NULL::${q(t)}, $1::jsonb) ON CONFLICT DO NOTHING`,
          files[t],
        );
      }
      // Rows that survived the delete but lost a link (for example an order's customer): put the link back.
      const links = await tx.$queryRawUnsafe<{ child: string; col: string }[]>(
        `SELECT cl.relname AS child, a.attname AS col
         FROM pg_constraint c
         JOIN pg_class cl ON cl.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f' AND c.confdeltype = 'n' AND array_length(c.conkey, 1) = 1 AND n.nspname = 'public'`,
      );
      const pks = await tx.$queryRawUnsafe<{ t: string; col: string }[]>(
        `SELECT cl.relname AS t, a.attname AS col
         FROM pg_index i
         JOIN pg_class cl ON cl.oid = i.indrelid
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
         WHERE i.indisprimary`,
      );
      let relinked = 0;
      for (const l of links) {
        if (!files[l.child] || !present.has(l.child) || !isSafeTableName(l.child)) continue;
        const pk = pks.filter((p) => p.t === l.child).map((p) => p.col);
        if (pk.length === 0) continue;
        const join = pk.map((c) => `x.${q(c)} = b.${q(c)}`).join(' AND ');
        relinked += await tx.$executeRawUnsafe(
          `UPDATE ${q(l.child)} x SET ${q(l.col)} = b.${q(l.col)}
           FROM jsonb_populate_recordset(NULL::${q(l.child)}, $1::jsonb) b
           WHERE ${join} AND x.${q(l.col)} IS NULL AND b.${q(l.col)} IS NOT NULL`,
          files[l.child],
        );
      }
      return { added, relinked };
    },
    { timeout: 180_000, maxWait: 20_000 },
  );

  const rowsRestored = totalRows(inserted.added);
  await logAuditEvent({
    actorId: actor.userId,
    action: 'data.restore',
    entity: 'data-reset',
    entityId: manifest.id,
    severity: 'WARNING',
    after: { rowsRestored, linksRestored: inserted.relinked, perTable: inserted.added },
  });
  return { rowsRestored, linksRestored: inserted.relinked };
}
