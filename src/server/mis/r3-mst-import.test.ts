/**
 * R3-MST B23 / B24 / B30 — the item import route (hardening, partial updates, code allocation, audit) and the
 * template route's permission gate, with the real permission layer (only the identity sources are mocked).
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake
type Row = Record<string, any>;

const state: { items: Row[]; audits: Row[]; failNextCreate: Row | null } = { items: [], audits: [], failNextCreate: null };
let nextId = 1;

vi.mock('@/server/mis/guard', () => ({ requireMisAccess: vi.fn().mockResolvedValue({ id: 'u1' }) }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async (e: Row) => { state.audits.push(e); } }));
vi.mock('@/server/db', () => ({
  db: {
    misItem: {
      findMany: async () => state.items.map((i) => ({ code: i.code })),
      findFirst: async ({ where }: Row) => {
        const or: Row[] = where.OR;
        return state.items.find((i) => or.some((cond) => Object.entries(cond).every(([k, v]) => i[k] === v))) ?? null;
      },
      update: async ({ where, data }: Row) => { const row = state.items.find((i) => i.id === where.id)!; Object.assign(row, data); return row; },
      create: async ({ data }: Row) => {
        if (state.failNextCreate) { const err = state.failNextCreate; state.failNextCreate = null; throw err; }
        if (state.items.some((i) => i.code === data.code)) throw Object.assign(new Error('Unique constraint failed on the fields: (`code`)'), { code: 'P2002', meta: { target: ['code'] } });
        if (data.sku && state.items.some((i) => i.sku === data.sku)) throw Object.assign(new Error('Unique constraint failed on the fields: (`sku`)'), { code: 'P2002', meta: { target: ['sku'] } });
        const row = { id: `item-${nextId++}`, isActive: true, deletedAt: null, ...data };
        state.items.push(row);
        return row;
      },
    },
  },
}));

const { POST } = await import('@/app/api/mis/inventory/import/route');
const { GET: getTemplate } = await import('@/app/api/mis/inventory/template/route');

const BOUNDARY = '----r3MstBoundary';
function upload(filename: string, content: string | Uint8Array, contentType = 'text/csv') {
  const head = `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const tail = `\r\n--${BOUNDARY}--\r\n`;
  const enc = new TextEncoder();
  const body = Buffer.concat([enc.encode(head), typeof content === 'string' ? enc.encode(content) : content, enc.encode(tail)]);
  return POST(new NextRequest('http://localhost/api/mis/inventory/import', {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    body,
  }));
}

const as = (role: string) => { getCurrentUser.mockResolvedValue({ id: 'u1' }); getMisRole.mockResolvedValue(role); };

beforeEach(() => {
  state.items = []; state.audits = []; state.failNextCreate = null; nextId = 1;
  vi.clearAllMocks();
  as('OWNER');
});

describe('B23 existing items are updated only from columns that are present and valid', () => {
  it('a row with only Name + Code keeps the stored category and unit', async () => {
    state.items.push({ id: 'a', code: 'RM-1', name: 'Old', category: 'RAW_MATERIAL', unit: 'KG', isActive: true, deletedAt: null });
    const res = await upload('items.csv', 'Code,Name\nRM-1,New name\n');
    expect(await res.json()).toMatchObject({ updated: 1, skipped: 0 });
    expect(state.items[0]).toMatchObject({ name: 'New name', category: 'RAW_MATERIAL', unit: 'KG' });
  });

  it('a blank or unknown category/unit cell leaves the stored value alone', async () => {
    state.items.push({ id: 'a', code: 'RM-1', name: 'Old', category: 'CONSUMABLE', unit: 'LITRE', isActive: true, deletedAt: null });
    await upload('items.csv', 'Code,Name,Category,Unit\nRM-1,Old,,\n');
    await upload('items.csv', 'Code,Name,Category,Unit\nRM-1,Old,NOPE,SHEETS\n');
    expect(state.items[0]).toMatchObject({ category: 'CONSUMABLE', unit: 'LITRE' });
  });

  it('a valid category in the row is applied', async () => {
    state.items.push({ id: 'a', code: 'RM-1', name: 'Old', category: 'CONSUMABLE', unit: 'LITRE', isActive: true, deletedAt: null });
    await upload('items.csv', 'Code,Name,Category,Unit\nRM-1,Old,EQUIPMENT,\n');
    expect(state.items[0]).toMatchObject({ category: 'EQUIPMENT', unit: 'LITRE' });
  });

  it('a soft-deleted or inactive item is skipped with a reason', async () => {
    state.items.push({ id: 'a', code: 'DEL-1', name: 'Gone', category: 'OTHER', unit: 'KG', isActive: false, deletedAt: new Date() });
    state.items.push({ id: 'b', code: 'OFF-1', name: 'Off', category: 'OTHER', unit: 'KG', isActive: false, deletedAt: null });
    const body = await (await upload('items.csv', 'Code,Name\nDEL-1,Back\nOFF-1,Back\n')).json();
    expect(body).toMatchObject({ updated: 0, skipped: 2 });
    expect(body.results.map((r: Row) => r.reason)).toEqual(['Item is deleted/inactive', 'Item is deleted/inactive']);
    expect(state.items[0].name).toBe('Gone');
  });
});

describe('B23 input hardening', () => {
  it('a corrupt workbook is a 400 JSON error, not a throw', async () => {
    const res = await upload('items.xlsx', new TextEncoder().encode('PK\u0003\u0004this is not a zip archive'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Could not read the file');
  });

  it('more than 2,000 data rows is a 400', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => `RM-${i + 1},Item ${i + 1}`);
    const res = await upload('items.csv', ['Code,Name', ...rows].join('\n'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Too many rows/);
    expect(state.items).toHaveLength(0);
  });

  it('exactly 2,000 rows is accepted', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => `RM-${i + 1},Item ${i + 1}`);
    const res = await upload('items.csv', ['Code,Name', ...rows].join('\n'));
    expect(res.status).toBe(200);
    expect(state.items).toHaveLength(2000);
  });

  it('a file over 5 MB is a 413', async () => {
    const res = await upload('items.csv', 'Code,Name\n' + 'x'.repeat(5 * 1024 * 1024 + 10));
    expect(res.status).toBe(413);
  });

  it('a duplicate SKU row reports plain words, never raw Prisma text', async () => {
    state.items.push({ id: 'a', code: 'RM-1', name: 'One', sku: 'S-1', isActive: true, deletedAt: null });
    const body = await (await upload('items.csv', 'Code,Name,Sku\nRM-2,Two,S-1\n')).json();
    // The row matches the existing item by SKU and updates it; force the constraint path with a raw P2002.
    expect(body.skipped + body.updated).toBe(1);
    state.failNextCreate = Object.assign(new Error('Unique constraint failed on the fields: (`sku`)'), { code: 'P2002', meta: { target: ['sku'] } });
    const body2 = await (await upload('items.csv', 'Code,Name,Sku\nRM-9,Nine,S-9\n')).json();
    expect(body2.results[0].status).toBe('skipped');
    expect(body2.results[0].reason).toBe("Item with sku 'S-9' already exists");
    expect(body2.results[0].reason).not.toMatch(/Unique constraint/);
  });
});

describe('B24 codes from the allocator', () => {
  it('two items imported without codes get consecutive ITM codes, deleted items counted', async () => {
    state.items.push({ id: 'a', code: 'ITM-0007', name: 'Deleted', isActive: false, deletedAt: new Date() });
    const body = await (await upload('items.csv', 'Name\nFirst\nSecond\n')).json();
    expect(body.results.map((r: Row) => r.code)).toEqual(['ITM-0008', 'ITM-0009']);
  });

  it('a P2002 on the first try uses the next code', async () => {
    state.failNextCreate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const body = await (await upload('items.csv', 'Name\nOnly\n')).json();
    expect(body.created).toBe(1);
    expect(body.results[0].code).toBe('ITM-0002');
  });
});

describe('B23 price audit (OWNER only)', () => {
  it('an OWNER price change is audited as { from, to }', async () => {
    state.items.push({ id: 'a', code: 'RM-1', name: 'One', pricePerUnit: 10, isActive: true, deletedAt: null });
    await upload('items.csv', 'Code,Name,Price\nRM-1,One,12.5\n');
    expect(state.items[0].pricePerUnit).toBe(12.5);
    expect(state.audits[0].after.pricePerUnit).toEqual({ from: 10, to: 12.5 });
  });

  it("an ADMIN's price column is ignored: nothing stored, nothing audited", async () => {
    as('ADMIN');
    state.items.push({ id: 'a', code: 'RM-1', name: 'One', pricePerUnit: 10, isActive: true, deletedAt: null });
    await upload('items.csv', 'Code,Name,Price\nRM-1,One,99\n');
    expect(state.items[0].pricePerUnit).toBe(10);
    expect(JSON.stringify(state.audits)).not.toMatch(/pricePerUnit":\{/);
    expect(state.audits[0].after.pricePerUnit).toBeUndefined();
  });
});

describe('B30 template route', () => {
  it('QC is refused with 403', async () => {
    as('QC');
    expect((await getTemplate()).status).toBe(403);
  });

  it('ADMIN gets the file', async () => {
    as('ADMIN');
    expect((await getTemplate()).status).toBe(200);
  });
});
