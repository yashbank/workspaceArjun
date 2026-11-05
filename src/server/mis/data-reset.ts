import { createHash, randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';

// @ts-expect-error — archiver v8 is pure ESM; @types/archiver lags behind the new named exports
import { ZipArchive } from 'archiver';

import type { Prisma } from '@/generated/prisma/client';
import {
  BACKUP_EXCLUDED_TABLES,
  CONFIRM_DELETE_WORD,
  CONFIRM_RESTORE_WORD,
  EMPLOYEE_KEEP_WHERE,
  RESET_GROUPS,
  backupName,
  cascadeRows,
  checkBackupCoversDelete,
  deleteSetFor,
  expandGroups,
  isResetGroupId,
  isSafeTableName,
  orderParentsFirst,
  tableToCsv,
  tablesForGroups,
  totalRows,
  type FkEdge,
  type ResetGroupId,
} from '@/lib/mis/data-reset-groups';
import { isUuid } from '@/lib/mis/ids';
import { db } from '@/server/db';
import { createPresignedGetUrl, getObject, getStorageDriverName, putObject } from '@/server/storage';

import { logAuditEvent } from './audit';
import { requirePermission } from './auth';

/**
 * Owner Danger Zone: back up, clear, and restore MIS data.
 *
 * SAFETY RULES (each one is pinned by data-reset.test.ts):
 *   1. Every exported function opens with requirePermission('data.reset'), which only OWNER holds.
 *   2. Nothing is deleted without a backup taken in the last hour whose files all still match their checksums, and
 *      nothing is deleted if a selected table has MORE rows now than the backup has (data the backup does not hold).
 *   3. The delete walks every foreign key from the selected tables, set-null links included, so nothing is orphaned. It
 *      runs children first in ONE transaction with the tables locked. If any step is refused, nothing is deleted.
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

export type BackupSummary = { id: string; name: string; createdAt: string; createdBy: string; totalRows: number };
/** `checksums` maps each file in the backup folder to its SHA-256. */
type Manifest = BackupSummary & { counts: Record<string, number>; checksums: Record<string, string> };

const q = (t: string) => `"${t}"`;
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const backupKey = (id: string, file: string) => `${PREFIX}/backups/${id}/${file}`;

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

async function foreignKeys(tx: Tx): Promise<FkEdge[]> {
  return tx.$queryRawUnsafe<FkEdge[]>(
    `SELECT cl.relname AS child, pl.relname AS parent
     FROM pg_constraint c
     JOIN pg_class cl ON cl.oid = c.conrelid
     JOIN pg_class pl ON pl.oid = c.confrelid
     JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE c.contype = 'f' AND n.nspname = 'public'`,
  );
}

async function count(tx: Tx, table: string): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${q(table)}`);
  return rows[0]?.n ?? 0;
}

async function countsFor(tx: Tx, tables: readonly string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = await count(tx, t);
  return out;
}

/**
 * The selected tables plus every table that depends on them, children first. The live catalog is the source: it is the
 * compiled form of prisma/schema.prisma, and data-reset-groups.test.ts proves the same walk against the schema file.
 * A selected table not in this database (a pending migration) holds no rows, so it is skipped.
 */
async function planDelete(tx: Tx, groupIds: readonly ResetGroupId[]) {
  const present = new Set(await dataTables(tx));
  const roots = tablesForGroups(groupIds).filter((t) => present.has(t));
  const fks = await foreignKeys(tx);
  const { tables, refused } = deleteSetFor(roots, fks);
  if (refused) throw new DataResetError(`Clearing this would also touch ${refused}, which is protected. Nothing was changed.`);
  return { tables: tables.filter((t) => present.has(t)), roots, fks };
}

async function readIndex(): Promise<BackupSummary[]> {
  try {
    const { bytes } = await getObject(INDEX_KEY);
    return JSON.parse(dec(bytes)) as BackupSummary[];
  } catch {
    return [];
  }
}

/** Read every file of the backup back from storage and compare it with its checksum. */
async function verifyBackup(manifest: Manifest) {
  if (!manifest.checksums) throw new DataResetError('That backup has no checksums. Take a fresh backup.');
  for (const [file, expected] of Object.entries(manifest.checksums)) {
    const { bytes } = await getObject(backupKey(manifest.id, file));
    if (sha256(bytes) !== expected) throw new DataResetError(`The backup could not be verified (${file}). Nothing was changed. Take a fresh backup.`);
  }
}

async function zipCsv(tables: Record<string, string>): Promise<Buffer> {
  const archive = new ZipArchive({ zlib: { level: 5 } });
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    out.on('end', resolve);
    archive.on('error', reject);
  });
  archive.pipe(out);
  for (const [t, json] of Object.entries(tables)) {
    // Parsed for reading in a spreadsheet only: restores use the raw JSON, so a float here can never reach the data.
    const csv = tableToCsv(JSON.parse(json) as Record<string, unknown>[]);
    if (csv) archive.append(Buffer.from(csv), { name: `${t}.csv` });
  }
  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}

async function readManifest(id: string): Promise<Manifest> {
  if (!isUuid(id)) throw new DataResetError('That is not a valid backup.');
  try {
    const { bytes } = await getObject(backupKey(id, 'manifest.json'));
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
  const counts = await db.$transaction(async (tx) => {
    const present = new Set(await dataTables(tx));
    return countsFor(tx, tablesForGroups(RESET_GROUPS.map((g) => g.id)).filter((t) => present.has(t)));
  });
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
    return { groups: expandGroups(ids), tree: cascadeRows(plan.roots, plan.fks, counts) };
  });
}

/** Always copies every table: `groupIds` only names the file after what is about to be cleared. */
export async function createBackup(input: { groupIds?: string[] } = {}) {
  const actor = await requirePermission('data.reset');
  assertStorageIsSafe();
  const id = randomUUID();
  const now = new Date();
  const createdAt = now.toISOString();
  const name = backupName(expandGroups((input.groupIds ?? []).filter(isResetGroupId)), now);

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
  const tablesJson = Object.fromEntries(Object.entries(snapshot).map(([t, v]) => [t, v.json]));
  const bundle = `{"format":"mis-backup-v1","id":"${id}","createdAt":"${createdAt}","tables":{${Object.entries(tablesJson)
    .map(([t, json]) => `${JSON.stringify(t)}:${json}`)
    .join(',')}}}`;
  const files: [string, Uint8Array, string][] = [
    ...Object.entries(tablesJson).map(([t, json]): [string, Uint8Array, string] => [`${t}.json`, enc(json), JSON_TYPE]),
    [`${name}.json`, enc(bundle), JSON_TYPE],
    [`${name}.csv.zip`, await zipCsv(tablesJson), 'application/zip'],
  ];
  for (const [file, bytes, type] of files) await putObject(backupKey(id, file), bytes, type);

  const counts = Object.fromEntries(Object.entries(snapshot).map(([t, v]) => [t, v.n]));
  const checksums = Object.fromEntries(files.map(([file, bytes]) => [file, sha256(bytes)]));
  const manifest: Manifest = { id, name, createdAt, createdBy: actor.userId, totalRows: totalRows(counts), counts, checksums };
  await putObject(backupKey(id, 'manifest.json'), enc(JSON.stringify(manifest)), JSON_TYPE);

  // Prove it: read every file back from storage before the backup is offered.
  await verifyBackup(manifest);

  const summary: BackupSummary = { id, name, createdAt, createdBy: actor.userId, totalRows: manifest.totalRows };
  await putObject(INDEX_KEY, enc(JSON.stringify([...(await readIndex()), summary])), JSON_TYPE);
  await logAuditEvent({ actorId: actor.userId, action: 'data.backup', entity: 'data-reset', entityId: id, after: { name, totalRows: manifest.totalRows, tables: Object.keys(counts).length } });
  return summary;
}

/** The JSON or CSV zip for the browser. On object storage this is a short-lived link, so size is not capped by the server. */
export async function getBackupDownload(input: {
  backupId: string;
  kind: string;
}): Promise<{ url: string } | { fileName: string; bytes: Uint8Array; contentType: string | undefined }> {
  const actor = await requirePermission('data.reset');
  if (input.kind !== 'json' && input.kind !== 'csv') throw new DataResetError('That is not a valid backup.');
  const manifest = await readManifest(input.backupId);
  const fileName = `${manifest.name}${input.kind === 'csv' ? '.csv.zip' : '.json'}`;
  if (!manifest.checksums?.[fileName]) throw new DataResetError('That backup has no download. Take a fresh backup.');
  const key = backupKey(manifest.id, fileName);
  await logAuditEvent({ actorId: actor.userId, action: 'data.backup.download', entity: 'data-reset', entityId: manifest.id, after: { fileName } });
  if (getStorageDriverName() === 's3') return { url: await createPresignedGetUrl(key, fileName) };
  return { fileName, ...(await getObject(key)) };
}

export async function deleteSelectedData(input: { groupIds: string[]; backupId: string; confirm: string }) {
  const actor = await requirePermission('data.reset');
  if (input.confirm !== CONFIRM_DELETE_WORD) throw new DataResetError(`Type ${CONFIRM_DELETE_WORD} to confirm.`);
  const ids = input.groupIds.filter(isResetGroupId);
  if (ids.length === 0) throw new DataResetError('Choose at least one kind of data.');
  const manifest = await readManifest(input.backupId);
  await verifyBackup(manifest);

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
  await verifyBackup(manifest);

  // Read every table file first, so a missing file stops us before anything changes.
  const files: Record<string, string> = {};
  for (const t of Object.keys(manifest.counts)) {
    if (!isSafeTableName(t) || BACKUP_EXCLUDED_TABLES.includes(t)) continue;
    if (manifest.counts[t] === 0) continue;
    files[t] = dec((await getObject(backupKey(manifest.id, `${t}.json`))).bytes);
  }

  const inserted = await db.$transaction(
    async (tx) => {
      const present = new Set(await dataTables(tx));
      const tables = Object.keys(files).filter((t) => present.has(t));
      const fks = await foreignKeys(tx);
      const added: Record<string, number> = {};
      for (const t of orderParentsFirst(tables, fks)) {
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
