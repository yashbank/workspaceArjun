/** R2-274 — a second PO against the same BOM material warns (never blocks) once the total passes the 5% tolerance. Db-free. */
import { describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let order: Row | null = null;
let lines: Row[] = [];
vi.mock('@/server/db', () => ({
  db: {
    misOrder: { findUnique: async () => order },
    misPoItem: { findMany: async () => lines },
  },
}));

const { bomOverOrderWarning } = await import('./po');

describe('bomOverOrderWarning', () => {
  it('nothing for a buffer-stock PO, an unlinked line, or an item the BOM does not use', async () => {
    expect(await bomOverOrderWarning({ bomRef: null }, 'i1')).toBeNull();
    expect(await bomOverOrderWarning({ bomRef: 'ORD-1' }, null)).toBeNull();
    order = { quantity: 100, bom: { stages: [{ materials: [] }] } };
    expect(await bomOverOrderWarning({ bomRef: 'ORD-1' }, 'i1')).toBeNull();
  });

  it('BOM 2 kg per unit x 100 ordered = 200 kg; 205 kg across live POs is within 5%, 300 kg warns with both figures', async () => {
    order = { quantity: 100, bom: { stages: [{ materials: [{ quantity: 2 }] }] } };
    lines = [{ quantity: 205 }];
    expect(await bomOverOrderWarning({ bomRef: 'ORD-100' }, 'i1')).toBeNull();
    lines = [{ quantity: 200 }, { quantity: 100 }];
    expect(await bomOverOrderWarning({ bomRef: 'ORD-100' }, 'i1')).toMatch(/total 300 of this item; the BOM needs 200/);
  });

  it('an order without a quantity reads the BOM as a flat total (x1)', async () => {
    order = { quantity: null, bom: { stages: [{ materials: [{ quantity: 500 }] }] } };
    lines = [{ quantity: 500 }, { quantity: 500 }];
    expect(await bomOverOrderWarning({ bomRef: 'ORD-100' }, 'i1')).toMatch(/1000 of this item; the BOM needs 500/);
  });
});
