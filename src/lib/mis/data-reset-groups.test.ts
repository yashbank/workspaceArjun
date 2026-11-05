import { describe, expect, it } from 'vitest';

import {
  BACKUP_MAX_AGE_MS,
  PROTECTED_TABLES,
  RESET_GROUPS,
  checkBackupCoversDelete,
  expandGroups,
  isSafeTableName,
  orderParentsFirst,
  tablesForGroups,
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
});
