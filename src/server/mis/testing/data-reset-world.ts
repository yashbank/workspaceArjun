import { createHash } from 'node:crypto';

import { orderParentsFirst } from '@/lib/mis/data-reset-groups';

/**
 * A dummy world for the Danger Zone tests against a real Postgres: two rows in every MIS table, walked from the live
 * catalog so a new table or column is covered without touching this file. Row 1 fills every column, row 2 only the
 * required ones, so backups meet real dates, decimals, JSON and NULLs.
 *
 * IMPORTANT: wipes tables. Only ever call it from a test that has checked it is on 127.0.0.1.
 */

type Sql = {
  $queryRawUnsafe: <T>(query: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<number>;
};
type Column = { t: string; c: string; udt: string; nullable: boolean; hasDefault: boolean; prec: number | null; scale: number | null };
type Row = Record<string, string | null>;
export type FkColumn = { child: string; col: string; parent: string; parentSchema: string; onDelete: string };

/** A stable uuid per table and row, so any row can name its parent. */
export function rowId(table: string, n: number): string {
  const h = createHash('md5').update(`${table}:${n}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export const OWNER_USER = rowId('user_profiles', 1);
export const STAFF_USER = rowId('user_profiles', 2);
const JSON_SAMPLE = '{"a": 1.50, "big": 12345678901234567890.123456789, "n": null, "s": "it\'s \\"q\\" ₹", "l": [1, {"at": "2026-01-02T03:04:05.678Z"}]}';

const ROWS: Record<string, number> = { mis_employees: 4, mis_inventory_ledger: 6 };

/** Ledger rows: what each `source` points at through its id-with-no-FK `source_id`. */
const LEDGER_SOURCES: [string, string | null][] = [
  ['STORE_ISSUE', rowId('mis_orders', 1)],
  ['GRN', rowId('mis_grns', 1)],
  ['GRN_REVERSAL', rowId('mis_grns', 2)],
  ['STORE_RETURN', rowId('mis_store_returns', 1)],
  ['COUNT_ADJUSTMENT', rowId('mis_physical_counts', 1)],
  ['OPENING', null],
];

/** The columns no type-driven value can get right: CHECK constraints and links that carry no FK. */
const OVERRIDES: Record<string, (row: Row, n: number) => void> = {
  user_profiles: (r, n) => void (r.auth_id = rowId('auth.users', n)),
  mis_customers: (r, n) => void (r.name = `DUMMY Customer ${n}`),
  mis_orders: (r, n) => void (r.order_number = `ORD-${n}`),
  mis_employees: (r, n) => {
    // 1 and 2 are clearable workers; 3 (Owner, signs in) and 4 (Admin) must survive every clear.
    if (n === 1) Object.assign(r, { user_profile_id: null, role: 'WORKER' });
    if (n === 3) Object.assign(r, { user_profile_id: OWNER_USER, role: 'OWNER', deleted_at: null, is_active: 'true' });
    if (n === 4) Object.assign(r, { user_profile_id: STAFF_USER, role: 'ADMIN', deleted_at: null, is_active: 'true' });
  },
  mis_purchase_orders: (r, n) => Object.assign(r, n === 1 ? { purpose: 'FOR_ORDER', bom_ref: 'ORD-1' } : { purpose: 'BUFFER_STOCK', bom_ref: null }),
  mis_job_phases: (r, n) => void (n === 1 && Object.assign(r, { status: 'IN_PROGRESS' })),
  mis_kiosk_devices: (r, n) =>
    Object.assign(r, { status: 'PENDING', pairing_code: `P${n}`, pairing_expires_at: '2026-03-04 05:06:07.123+05:30' }),
  mis_attendance_punches: (r, n) =>
    Object.assign(
      r,
      n === 1
        ? { supersedes_id: null, correction_reason: null, corrected_by_id: null, recorded_by_id: null }
        : { supersedes_id: rowId('mis_attendance_punches', 1), correction_reason: 'typo', corrected_by_id: OWNER_USER },
    ),
  mis_worker_allocations: (r, n) => void (n === 1 && Object.assign(r, { release_reason: 'MANUAL', crew_role: 'OPERATOR' })),
  mis_inventory_ledger: (r, n) => Object.assign(r, { source: LEDGER_SOURCES[n - 1][0], source_id: LEDGER_SOURCES[n - 1][1] }),
  mis_order_stock_allocations: (r, n) => Object.assign(r, { source: 'GRN', source_id: rowId('mis_grns', n) }),
  mis_document_versions: (r, n) => void (r.ref_id = rowId('mis_orders', n)),
  mis_quarantine_stock: (r, n) => Object.assign(r, { grn_item_id: rowId('mis_grn_items', n), supplier_id: rowId('mis_suppliers', n) }),
  mis_payroll_snapshot_lines: (r, n) => void (r.employee_id = rowId('mis_employees', n)),
  mis_grn_items: (r, n) => void (n === 1 && (r.for_order_ref = 'ORD-1')),
};

function typedValue(col: Column, n: number, firstEnum: Map<string, string>): string {
  const enumLabel = firstEnum.get(col.udt);
  if (enumLabel) return enumLabel;
  switch (col.udt) {
    case 'uuid':
      return rowId(`${col.t}.${col.c}`, n);
    case 'text':
    case 'varchar':
      return `dummy ${col.c} ${n}, "O'Brien" ₹`;
    case 'int4':
    case 'int8':
      return String(n);
    case 'bool':
      return n === 2 ? 'false' : 'true';
    case 'date':
      return `2026-03-0${n}`;
    case 'timestamp':
      return `2026-03-0${n} 05:06:07.123`;
    case 'timestamptz':
      return `2026-03-0${n} 05:06:07.123456+05:30`;
    case 'numeric':
      if (col.scale === null) return `${n}.1234567890123456789`;
      return `${n}${col.scale > 0 ? `.${'1234567890'.repeat(3).slice(0, col.scale)}` : ''}`;
    case 'jsonb':
      return JSON_SAMPLE;
    default:
      throw new Error(`data-reset-world: no sample value for ${col.t}.${col.c} (${col.udt})`);
  }
}

export async function liveForeignKeys(sql: Sql): Promise<FkColumn[]> {
  return sql.$queryRawUnsafe<FkColumn[]>(
    `SELECT cl.relname::text AS child, a.attname::text AS col, pl.relname::text AS parent, pn.nspname::text AS "parentSchema", c.confdeltype::text AS "onDelete"
     FROM pg_constraint c
     JOIN pg_class cl ON cl.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = cl.relnamespace
     JOIN pg_class pl ON pl.oid = c.confrelid
     JOIN pg_namespace pn ON pn.oid = pl.relnamespace
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND n.nspname = 'public'`,
  );
}

export async function misTables(sql: Sql): Promise<string[]> {
  const rows = await sql.$queryRawUnsafe<{ t: string }[]>(
    `SELECT c.relname::text AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'mis\\_%' ORDER BY 1`,
  );
  return rows.map((r) => r.t);
}

/** Empties every MIS table and refills it. Returns the rows seeded per table. */
export async function seedWorld(sql: Sql): Promise<Record<string, number>> {
  const tables = await misTables(sql);
  await sql.$executeRawUnsafe(`TRUNCATE ${[...tables, 'user_profiles'].map((t) => `"${t}"`).join(', ')}, auth.users CASCADE`);

  const fks = await liveForeignKeys(sql);
  const fkOf = new Map(fks.map((f) => [`${f.child}.${f.col}`, f]));
  const columns = await sql.$queryRawUnsafe<Column[]>(
    `SELECT table_name AS t, column_name AS c, udt_name AS udt, is_nullable = 'YES' AS nullable, column_default IS NOT NULL AS "hasDefault",
            numeric_precision::int AS prec, numeric_scale::int AS scale
     FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
  );
  const enums = await sql.$queryRawUnsafe<{ typname: string; label: string }[]>(
    `SELECT DISTINCT ON (t.typname) t.typname::text AS typname, e.enumlabel::text AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid ORDER BY t.typname, e.enumsortorder`,
  );
  const firstEnum = new Map(enums.map((e) => [e.typname, e.label]));

  for (const n of [1, 2]) await sql.$executeRawUnsafe(`INSERT INTO auth.users (id, email) VALUES ($1::uuid, $2)`, rowId('auth.users', n), `dummy${n}@example.test`);

  const seeded: Record<string, number> = {};
  for (const t of orderParentsFirst(['user_profiles', ...tables], fks)) {
    const count = ROWS[t] ?? 2;
    const cols = columns.filter((c) => c.t === t);
    for (let n = 1; n <= count; n++) {
      const row: Row = {};
      for (const col of cols) {
        const sparse = n === 2 && col.c !== 'id' && (col.nullable || col.hasDefault);
        if (sparse) continue;
        const fk = fkOf.get(`${t}.${col.c}`);
        if (col.c === 'id') row.id = rowId(t, n);
        else if (fk?.parentSchema === 'auth') row[col.c] = rowId('auth.users', 1);
        else if (fk?.parent === t) row[col.c] = n === 1 ? null : rowId(t, 1);
        else if (fk) row[col.c] = rowId(fk.parent, Math.min(n, ROWS[fk.parent] ?? 2));
        else row[col.c] = typedValue(col, n, firstEnum);
      }
      OVERRIDES[t]?.(row, n);
      const names = Object.keys(row);
      const udt = (c: string) => `"${cols.find((x) => x.c === c)!.udt}"`;
      await sql.$executeRawUnsafe(
        `INSERT INTO "${t}" (${names.map((c) => `"${c}"`).join(', ')}) VALUES (${names.map((c, i) => `$${i + 1}::text::${udt(c)}`).join(', ')})`,
        ...names.map((c) => row[c]),
      );
    }
    seeded[t] = count;
  }
  return seeded;
}

/** Every row of every table, twice over: the row cast to text tells SQL NULL from JSON null, to_jsonb keeps the structure. */
export async function snapshotRows(sql: Sql, tables: readonly string[]): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  for (const t of tables) {
    const rows = await sql.$queryRawUnsafe<{ r: string }[]>(`SELECT snap_row::text || ' ' || to_jsonb(snap_row)::text AS r FROM "${t}" snap_row ORDER BY 1`);
    out[t] = rows.map((r) => r.r);
  }
  return out;
}
