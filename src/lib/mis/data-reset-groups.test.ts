import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  BACKUP_MAX_AGE_MS,
  PROTECTED_TABLES,
  RESET_GROUPS,
  backupName,
  cascadeRows,
  checkBackupCoversDelete,
  blankedTables,
  deleteSetFor,
  expandGroups,
  isSafeTableName,
  orderParentsFirst,
  tableToCsv,
  tablesForGroups,
  type FkEdge,
} from './data-reset-groups';

describe('reset groups', () => {
  it('every table name is a plain mis_ name and none is protected', () => {
    for (const g of RESET_GROUPS) {
      for (const t of g.tables) {
        expect(isSafeTableName(t), t).toBe(true);
        expect(PROTECTED_TABLES, t).not.toContain(t);
      }
    }
  });

  it('deleting employees also clears attendance and finance', () => {
    expect(expandGroups(['employees'])).toEqual(['attendance', 'finance', 'employees']);
  });

  it('expandGroups drops duplicates and keeps screen order', () => {
    expect(expandGroups(['finance', 'finance', 'customers'])).toEqual(['customers', 'finance']);
  });

  it('tablesForGroups lists a shared table once', () => {
    const t = tablesForGroups(['orders', 'inventory']);
    expect(t.filter((x) => x === 'mis_order_stock_allocations')).toHaveLength(1);
  });

  it('rejects anything that could be SQL injection', () => {
    expect(isSafeTableName('mis_orders')).toBe(true);
    expect(isSafeTableName('mis_orders; DROP TABLE x')).toBe(false);
    expect(isSafeTableName('users')).toBe(false);
    expect(isSafeTableName('MIS_orders')).toBe(false);
  });
});

describe('orderParentsFirst', () => {
  it('puts parents before children and ignores self links and outside tables', () => {
    const order = orderParentsFirst(
      ['mis_grns', 'mis_purchase_orders', 'mis_employees'],
      [
        { child: 'mis_grns', parent: 'mis_purchase_orders' },
        { child: 'mis_employees', parent: 'mis_employees' },
        { child: 'mis_grns', parent: 'outside' },
      ],
    );
    expect(order.indexOf('mis_purchase_orders')).toBeLessThan(order.indexOf('mis_grns'));
  });

  it('refuses a cycle', () => {
    expect(() =>
      orderParentsFirst(['a', 'b'], [{ child: 'a', parent: 'b' }, { child: 'b', parent: 'a' }]),
    ).toThrow(/no safe order/);
  });
});

describe('checkBackupCoversDelete', () => {
  const now = new Date('2026-11-05T10:00:00Z');
  const base = { now, tables: ['mis_customers'], backupCounts: { mis_customers: 5 }, currentCounts: { mis_customers: 5 } };

  it('allows a fresh backup that holds everything', () => {
    expect(checkBackupCoversDelete({ ...base, backupCreatedAt: new Date(now.getTime() - 60_000) }).ok).toBe(true);
  });
  it('refuses a backup older than an hour', () => {
    const r = checkBackupCoversDelete({ ...base, backupCreatedAt: new Date(now.getTime() - BACKUP_MAX_AGE_MS - 1) });
    expect(r.ok).toBe(false);
  });
  it('refuses when rows were added after the backup', () => {
    const r = checkBackupCoversDelete({ ...base, currentCounts: { mis_customers: 6 }, backupCreatedAt: new Date(now.getTime() - 60_000) });
    expect(r.ok).toBe(false);
  });
  it('refuses a backup dated in the future', () => {
    expect(checkBackupCoversDelete({ ...base, backupCreatedAt: new Date(now.getTime() + 60_000) }).ok).toBe(false);
  });
  it('refuses a same-count edit: the fingerprint moved', () => {
    const fresh = { ...base, backupCreatedAt: new Date(now.getTime() - 60_000), backupFingerprints: { mis_customers: '111' } };
    expect(checkBackupCoversDelete({ ...fresh, currentFingerprints: { mis_customers: '111' } }).ok).toBe(true);
    expect(checkBackupCoversDelete({ ...fresh, currentFingerprints: { mis_customers: '222' } }).ok).toBe(false);
  });
});

/** Every foreign key in prisma/schema.prisma, so these tests follow the schema instead of a hand list. */
function schemaEdges(): FkEdge[] {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const models = new Map<string, { table: string; body: string }>();
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    models.set(m[1], { table: m[2].match(/@@map\("([^"]+)"\)/)?.[1] ?? m[1], body: m[2] });
  }
  const edges: FkEdge[] = [];
  for (const { table, body } of models.values()) {
    for (const line of body.split('\n')) {
      const rel = line.match(/^\s*\w+\s+(\w+)\??\s+@relation\(.*fields:/);
      const parent = rel && models.get(rel[1]);
      if (parent) edges.push({ child: table, parent: parent.table });
    }
  }
  return edges;
}

describe('delete set, derived from prisma/schema.prisma', () => {
  const edges = schemaEdges();

  it('the schema parser finds the foreign keys', () => {
    expect(edges.length).toBeGreaterThan(90);
    expect(edges).toContainEqual({ child: 'mis_orders', parent: 'mis_customers' });
  });

  it.each(RESET_GROUPS.map((g) => g.id))('%s: every FK child of a deleted table is deleted too, children first', (id) => {
    const { tables, refused } = deleteSetFor(tablesForGroups([id]), edges);
    expect(refused).toBeNull();
    for (const e of edges) {
      if (e.child === e.parent || !tables.includes(e.parent)) continue;
      expect(tables, `${e.child} points at ${e.parent}`).toContain(e.child);
      expect(tables.indexOf(e.child), `${e.child} before ${e.parent}`).toBeLessThan(tables.indexOf(e.parent));
    }
  });

  it('clear-all has a safe order and touches no protected table', () => {
    const { tables, refused } = deleteSetFor(tablesForGroups(RESET_GROUPS.map((g) => g.id)), edges);
    expect(refused).toBeNull();
    for (const t of PROTECTED_TABLES) expect(tables).not.toContain(t);
  });

  it('selecting customers pulls in the whole order chain (the owner\'s localhost bug)', () => {
    const { tables } = deleteSetFor(['mis_customers'], edges);
    for (const t of ['mis_orders', 'mis_bom', 'mis_bom_stages', 'mis_production_log', 'mis_job_phases', 'mis_machine_allocations', 'mis_qc_checks', 'mis_documents', 'mis_document_versions']) {
      expect(tables).toContain(t);
    }
  });

  it('an order takes its purchase orders with it: bom_ref has no FK, and a CHECK stops it being blanked', () => {
    const { tables } = deleteSetFor(['mis_orders'], edges);
    for (const t of ['mis_purchase_orders', 'mis_po_items', 'mis_grns', 'mis_supplier_invoices']) expect(tables).toContain(t);
    expect(tables).not.toContain('mis_suppliers');
  });

  it('refuses when the walk reaches a protected or non-MIS table', () => {
    expect(deleteSetFor(['mis_a'], [{ child: 'mis_audit_logs', parent: 'mis_a' }])).toEqual({ tables: [], refused: 'mis_audit_logs' });
    expect(deleteSetFor(['mis_a'], [{ child: 'user_profiles', parent: 'mis_a' }]).refused).toBe('user_profiles');
  });

  it('the cascade tree shows every table once, with its count', () => {
    const roots = ['mis_customers'];
    const { tables } = deleteSetFor(roots, edges);
    const rows = cascadeRows(roots, edges, Object.fromEntries(tables.map((t) => [t, 2])));
    expect(rows.map((r) => r.name).sort()).toEqual([...tables].sort());
    expect(rows[0]).toEqual({ name: 'mis_customers', rows: 2, depth: 0 });
    expect(rows.find((r) => r.name === 'mis_orders')?.depth).toBe(1);
  });
});

describe('set-null links into a partly cleared table', () => {
  const edges: FkEdge[] = [
    { child: 'mis_production_log', parent: 'mis_employees', onDelete: 'n' },
    { child: 'mis_machine_allocations', parent: 'mis_production_log', onDelete: 'n' },
    { child: 'mis_worker_allocations', parent: 'mis_employees', onDelete: 'a' },
    { child: 'mis_orders', parent: 'mis_customers', onDelete: 'n' },
  ];

  it('stay, with whatever hangs off them; a required link is still walked', () => {
    const { tables } = deleteSetFor(['mis_employees'], edges);
    expect([...tables].sort()).toEqual(['mis_employees', 'mis_worker_allocations']);
    expect(blankedTables(tables, edges)).toEqual(['mis_production_log']);
  });

  it('a fully cleared parent still takes its set-null children', () => {
    const { tables } = deleteSetFor(['mis_customers'], edges);
    expect(tables).toContain('mis_orders');
    expect(blankedTables(tables, edges)).toEqual([]);
  });

  it('a child cleared for another reason is not reported as blanked', () => {
    const { tables } = deleteSetFor(['mis_employees', 'mis_production_log'], edges);
    expect(tables).toContain('mis_production_log');
    expect(blankedTables(tables, edges)).toEqual([]);
  });
});

describe('backup files', () => {
  const at = new Date('2026-11-06T20:00:05Z');

  it('names the file in factory time', () => {
    expect(backupName(['customers', 'machine_allocation'], at)).toBe('bpp-backup-customers-machine-allocation-2026-11-07_01-30-05');
    expect(backupName([], at)).toBe('bpp-backup-all-2026-11-07_01-30-05');
    expect(backupName(RESET_GROUPS.map((g) => g.id), at)).toBe('bpp-backup-all-2026-11-07_01-30-05');
  });

  it('writes a table as CSV without rounding numbers', () => {
    expect(tableToCsv([{ a: 1.2345, b: null, c: { x: 1 } }])).toBe('a,b,c\r\n1.2345,,"{""x"":1}"\r\n');
    expect(tableToCsv([])).toBe('');
  });
});
