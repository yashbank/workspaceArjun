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
  SOURCE_LINKS,
  TRUNCATE_TABLES,
  WORKER_ALLOCATION_KEEP_WHERE,
  backupName,
  blankedTables,
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
 *      nothing is deleted if any table the delete changes differs from the backup: more rows, or a row hash that moved.
 *   3. The delete walks every foreign key from the selected tables, set-null links included, so nothing is orphaned. It
 *      runs children first in ONE transaction with the tables locked. If any step is refused, nothing is deleted.
 *      The stock books go whole with what they recorded (LOOSE_LINKS), so stock reads 0 and no `source_id` is left dangling.
 *      A set-null child of partly cleared mis_employees stays, and the database blanks its link to each cleared row.
 *   4. Sign-in accounts, Owner/Admin employees, the audit log, paired tablets and settings/masters are never deleted.
 *   5. A restore only ADDS back rows that are missing (ON CONFLICT DO NOTHING) and refills blank links to the parents it
 *      just brought back, the only way a delete's blanking can be told from a link cleared on purpose. It never overwrites
 *      or removes anything, so it is safe to run twice. A row that would clash on a second unique key stops the whole
 *      restore, by table name. A JSON `null` stored in a jsonb column comes back as SQL NULL: to_jsonb cannot tell them
 *      apart, and the app never writes a JSON null. A stock book that lost rows to a clear and has new rows since is
 *      refused whole, by table name: its latest row is the balance, and two histories cannot be merged.
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
/**
 * The start gate on mis_job_phases judges each insert as a fresh start, so it would refuse a state it once allowed (a
 * running phase after its earlier phase was reopened). Last phase first leaves it no earlier phase to object to. A
 * BEFORE trigger also fires on a row ON CONFLICT would skip, so rows already here are left out by hand.
 */
const PHASE_RESTORE_ORDER = ' WHERE NOT EXISTS (SELECT 1 FROM mis_job_phases p WHERE p.id = x.id) ORDER BY x.sequence DESC';
/** Each row's balance follows the row before it, and the latest row by created_at is the balance. */
const STOCK_BOOKS = ['mis_inventory_ledger', 'mis_store_transactions'];

export type BackupSummary = { id: string; name: string; createdAt: string; createdBy: string; totalRows: number };
/** `checksums` maps each file in the backup folder to its SHA-256. */
type Manifest = BackupSummary & { counts: Record<string, number>; fingerprints: Record<string, string>; checksums: Record<string, string> };

const q = (t: string) => `"${t}"`;
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const backupKey = (id: string, file: string) => `${PREFIX}/backups/${id}/${file}`;
/** Order-free hash of every row of the table aliased `backup_row`, so any edit moves it, with or without an updated_at column. */
const FINGERPRINT = `COALESCE(sum(hashtextextended(backup_row::text, 0)::numeric), 0)::text`;

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
    `SELECT cl.relname AS child, pl.relname AS parent, c.confdeltype::text AS "onDelete"
     FROM pg_constraint c
     JOIN pg_class cl ON cl.oid = c.conrelid
     JOIN pg_class pl ON pl.oid = c.confrelid
     JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE c.contype = 'f' AND n.nspname = 'public'`,
  );
}

/** The WHERE of a table a clear only partly empties. `keepAllocations`: nothing but Employees reaches mis_worker_allocations. */
function keepWhere(t: string, keepAllocations = false) {
  if (t === 'mis_employees') return ` WHERE ${EMPLOYEE_KEEP_WHERE}`;
  return keepAllocations && t === 'mis_worker_allocations' ? ` WHERE ${WORKER_ALLOCATION_KEEP_WHERE}` : '';
}

async function count(tx: Tx, table: string, where = ''): Promise<number> {
  const rows = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${q(table)}${where}`);
  return rows[0]?.n ?? 0;
}

/** What a backup is compared against. */
async function tableStates(tx: Tx, tables: readonly string[]) {
  const counts: Record<string, number> = {};
  const fingerprints: Record<string, string> = {};
  for (const t of tables) {
    const rows = await tx.$queryRawUnsafe<{ n: number; h: string }[]>(`SELECT count(*)::int AS n, ${FINGERPRINT} AS h FROM ${q(t)} backup_row`);
    counts[t] = rows[0]?.n ?? 0;
    fingerprints[t] = rows[0]?.h;
  }
  return { counts, fingerprints };
}

/** What a clear would really remove, which is what the Owner must be shown: the kept Owner and Admin rows do not count. */
async function clearableCountsFor(tx: Tx, tables: readonly string[], keepAllocations = false): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) out[t] = await count(tx, t, keepWhere(t, keepAllocations));
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
  const withoutEmployees = tablesForGroups(groupIds.filter((id) => id !== 'employees')).filter((t) => present.has(t));
  return {
    tables: tables.filter((t) => present.has(t)),
    /** Not cleared, but the delete still blanks links in them, so the backup must cover them too. */
    blanked: blankedTables(tables, fks).filter((t) => present.has(t)),
    keepAllocations: !deleteSetFor(withoutEmployees, fks).tables.includes('mis_worker_allocations'),
    roots,
    fks,
  };
}

/** A key that is not there: ENOENT from the local driver, NoSuchKey or a 404 from S3. */
function isMissingKey(error: unknown): boolean {
  const e = error as { code?: unknown; name?: unknown; $metadata?: { httpStatusCode?: unknown } } | null;
  return e?.code === 'ENOENT' || e?.name === 'NoSuchKey' || e?.$metadata?.httpStatusCode === 404;
}

/** Only a missing index is an empty list. Reading anything else as empty would let createBackup overwrite older entries. */
async function readIndex(): Promise<BackupSummary[]> {
  try {
    const { bytes } = await getObject(INDEX_KEY);
    return JSON.parse(dec(bytes)) as BackupSummary[];
  } catch (error) {
    if (isMissingKey(error)) return [];
    console.error('data-reset: index read failed', error instanceof Error ? error.message : 'unknown');
    throw new DataResetError('The backup list could not be read. Nothing was added to it. Try again.');
  }
}

/** Read every file of the backup back from storage and compare it with its checksum. */
async function verifyBackup(manifest: Manifest) {
  if (!manifest.checksums) throw new DataResetError('That backup has no checksums. Take a fresh backup.');
  for (const [file, expected] of Object.entries(manifest.checksums)) {
    const stored = await getObject(backupKey(manifest.id, file)).catch(() => null);
    if (!stored || sha256(stored.bytes) !== expected) throw new DataResetError(`The backup could not be verified (${file}). Nothing was changed. Take a fresh backup.`);
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
    return clearableCountsFor(tx, tablesForGroups(RESET_GROUPS.map((g) => g.id)).filter((t) => present.has(t)));
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
    const counts = await clearableCountsFor(tx, plan.tables, plan.keepAllocations);
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
      const out: Record<string, { json: string; n: number; h: string }> = {};
      for (const t of await dataTables(tx)) {
        const rows = await tx.$queryRawUnsafe<{ j: string; n: number; h: string }[]>(
          // The alias must not match a column: mis_dashboard_widgets has an `x`, and to_jsonb(x) would then copy only that column.
          `SELECT COALESCE(jsonb_agg(to_jsonb(backup_row)), '[]'::jsonb)::text AS j, count(*)::int AS n, ${FINGERPRINT} AS h FROM ${q(t)} backup_row`,
        );
        out[t] = { json: rows[0].j, n: rows[0].n, h: rows[0].h };
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
  const fingerprints = Object.fromEntries(Object.entries(snapshot).map(([t, v]) => [t, v.h]));
  const checksums = Object.fromEntries(files.map(([file, bytes]) => [file, sha256(bytes)]));
  const manifest: Manifest = { id, name, createdAt, createdBy: actor.userId, totalRows: totalRows(counts), counts, fingerprints, checksums };
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
      const touched = [...plan.tables, ...plan.blanked];
      // Block writers while we check and delete, so the check below stays true until the delete is done.
      for (const t of touched) await tx.$executeRawUnsafe(`LOCK TABLE ${q(t)} IN EXCLUSIVE MODE`);
      const { counts: current, fingerprints } = await tableStates(tx, touched);
      const verdict = checkBackupCoversDelete({
        backupCreatedAt: new Date(manifest.createdAt),
        now: new Date(),
        backupCounts: manifest.counts,
        currentCounts: current,
        backupFingerprints: manifest.fingerprints,
        currentFingerprints: fingerprints,
        tables: touched,
      });
      if (!verdict.ok) throw new DataResetError(verdict.reason);
      const removed: Record<string, number> = {};
      for (const t of plan.tables) {
        if (TRUNCATE_TABLES.includes(t)) {
          await tx.$executeRawUnsafe(`TRUNCATE ${q(t)}`);
          removed[t] = current[t];
        } else {
          removed[t] = await tx.$executeRawUnsafe(`DELETE FROM ${q(t)}${keepWhere(t, plan.keepAllocations)}`);
        }
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
      const pks = await tx.$queryRawUnsafe<{ t: string; col: string }[]>(
        `SELECT cl.relname AS t, a.attname AS col
         FROM pg_index i
         JOIN pg_class cl ON cl.oid = i.indrelid
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
         WHERE i.indisprimary`,
      );
      const pkOf = (t: string) => pks.filter((p) => p.t === t).map((p) => p.col);
      const samePk = (t: string) => pkOf(t).map((c) => `x.${q(c)} = b.${q(c)}`).join(' AND ');
      for (const t of STOCK_BOOKS) {
        if (!files[t] || !present.has(t)) continue;
        // Held until commit, so nothing can be posted between this check and the insert.
        await tx.$executeRawUnsafe(`LOCK TABLE ${q(t)} IN EXCLUSIVE MODE`);
        const backedUp = `jsonb_populate_recordset(NULL::${q(t)}, $1::jsonb) b`;
        const [book] = await tx.$queryRawUnsafe<{ lost: boolean; posted: boolean }[]>(
          `SELECT EXISTS (SELECT 1 FROM ${backedUp} WHERE NOT EXISTS (SELECT 1 FROM ${q(t)} x WHERE ${samePk(t)})) AS lost,
                  EXISTS (SELECT 1 FROM ${q(t)} x WHERE NOT EXISTS (SELECT 1 FROM ${backedUp} WHERE ${samePk(t)})) AS posted`,
          files[t],
        );
        if (book.lost && book.posted) {
          throw new DataResetError(`The restore stopped at ${t}: stock was posted there since the clear, and the old history cannot be merged with the new one. Nothing was changed. Clear the stock books again, then restore.`);
        }
      }
      const added: Record<string, number> = {};
      /** The primary keys this restore really put back, per table. */
      const broughtBack: Record<string, string[]> = {};
      for (const t of orderParentsFirst(tables, fks)) {
        const missing = pkOf(t).length === 0 ? [] : await tx.$queryRawUnsafe<{ k: string }[]>(
          `SELECT ${pkOf(t).map((c) => `b.${q(c)}::text`).join(` || '|' || `)} AS k FROM jsonb_populate_recordset(NULL::${q(t)}, $1::jsonb) b
           WHERE NOT EXISTS (SELECT 1 FROM ${q(t)} x WHERE ${samePk(t)})`,
          files[t],
        );
        added[t] = await tx.$executeRawUnsafe(
          `INSERT INTO ${q(t)} SELECT * FROM jsonb_populate_recordset(NULL::${q(t)}, $1::jsonb) x${t === 'mis_job_phases' ? PHASE_RESTORE_ORDER : ''} ON CONFLICT DO NOTHING`,
          files[t],
        );
        // ON CONFLICT also skips a missing row that clashes on a second unique key, and its children would then fail.
        if (added[t] < missing.length) {
          throw new DataResetError(`The restore stopped at ${t}: ${missing.length - added[t]} of its rows clash with a newer record that has the same code or number. Nothing was changed. Rename or remove the newer record, then restore again.`);
        }
        broughtBack[t] = missing.map((m) => m.k);
      }
      // Rows that survived the delete but lost a link: put it back, but only to a parent brought back just now, so a link
      // cleared on purpose stays clear and no link can point at a parent that is not here.
      const setNullLinks = await tx.$queryRawUnsafe<{ child: string; col: string; parent: string }[]>(
        `SELECT cl.relname AS child, a.attname AS col, pl.relname AS parent
         FROM pg_constraint c
         JOIN pg_class cl ON cl.oid = c.conrelid
         JOIN pg_class pl ON pl.oid = c.confrelid
         JOIN pg_namespace n ON n.oid = cl.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f' AND c.confdeltype = 'n' AND array_length(c.conkey, 1) = 1 AND n.nspname = 'public'`,
      );
      const links: { child: string; col: string; parent: string; source?: string }[] = [
        ...setNullLinks,
        ...SOURCE_LINKS.map((l) => ({ child: l.table, col: 'source_id', parent: l.parent, source: l.source })),
      ];
      let relinked = 0;
      for (const l of links) {
        if (!broughtBack[l.parent]?.length || !files[l.child] || !present.has(l.child) || !isSafeTableName(l.child) || pkOf(l.child).length === 0) continue;
        relinked += await tx.$executeRawUnsafe(
          `UPDATE ${q(l.child)} x SET ${q(l.col)} = b.${q(l.col)}
           FROM jsonb_populate_recordset(NULL::${q(l.child)}, $1::jsonb) b
           WHERE ${samePk(l.child)} AND x.${q(l.col)} IS NULL AND b.${q(l.col)}::text = ANY ($2::text[])${l.source ? ' AND x.source = $3' : ''}`,
          ...[files[l.child], broughtBack[l.parent], ...(l.source ? [l.source] : [])],
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
