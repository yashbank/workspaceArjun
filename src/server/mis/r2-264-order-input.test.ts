/** R2-264 quantity + unit are mandatory on a new order · R2-265 Customer PO # is optional and searchable. Db-free. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

vi.mock('@/server/auth', () => ({ getCurrentUser: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'ADMIN' }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/business-rules', () => ({ getRuleValue: async () => null, getFactoryTimezone: async () => 'Asia/Kolkata' }));

const create = vi.fn(async ({ data }: Row) => ({ id: 'o-new', ...data }));
const update = vi.fn(async ({ data }: Row) => ({ id: 'o1', ...data }));
const findMany = vi.fn(async (_a?: Row) => [] as Row[]);
let existing: Row = { id: 'o1', orderNumber: 'ORD-1', status: 'DRAFT', quantity: null, unit: null };
vi.mock('@/server/db', () => ({
  db: {
    misOrder: {
      create: (a: Row) => create(a),
      update: (a: Row) => update(a),
      findUnique: async () => existing,
      findMany: (a: Row) => findMany(a),
      count: async () => 0,
    },
  },
}));

const { createOrder, updateOrder, listOrdersPage } = await import('./orders');

beforeEach(() => {
  vi.clearAllMocks();
  existing = { id: 'o1', orderNumber: 'ORD-1', status: 'DRAFT', quantity: null, unit: null };
});

describe('R2-264 createOrder', () => {
  it('refuses a new order without a quantity or with an unknown unit, before anything is written', async () => {
    await expect(createOrder({ description: 'Boxes' })).rejects.toThrow(/order quantity/);
    await expect(createOrder({ quantity: 10, unit: 'BOX' })).rejects.toThrow(/Pieces, kg or Reams/);
    expect(create).not.toHaveBeenCalled();
  });
  it('stores quantity, unit and a trimmed Customer PO #', async () => {
    const rec = await createOrder({ quantity: '10000', unit: 'PIECE', customerPoRef: '  PO-AMZ-2026-99 ' });
    expect(create.mock.calls[0][0].data).toMatchObject({ quantity: 10000, unit: 'PIECE', customerPoRef: 'PO-AMZ-2026-99' });
    expect(rec.customerPoRef).toBe('PO-AMZ-2026-99');
  });
  it('R2-265: the Customer PO # is optional', async () => {
    await createOrder({ quantity: 5, unit: 'REAM' });
    expect(create.mock.calls[0][0].data.customerPoRef).toBeNull();
  });
});

describe('R2-264 updateOrder', () => {
  it('an older order with no quantity may be edited without one, but a quantity given must be valid', async () => {
    await expect(updateOrder('o1', { description: 'x' })).resolves.toBeDefined();
    await expect(updateOrder('o1', { quantity: 0, unit: 'KG' })).rejects.toThrow(/more than zero/);
    await expect(updateOrder('o1', { quantity: 20, unit: 'KG', customerPoRef: ' C-1 ' })).resolves.toBeDefined();
    expect(update.mock.calls.at(-1)![0].data).toMatchObject({ quantity: 20, unit: 'KG', customerPoRef: 'C-1' });
  });
  it('once set, the quantity cannot be blanked', async () => {
    existing = { ...existing, quantity: 20, unit: 'KG' };
    await expect(updateOrder('o1', { quantity: null })).rejects.toThrow(/order quantity/);
  });
});

describe('R2-265 search', () => {
  it('the list search also matches the Customer PO #', async () => {
    await listOrdersPage({ q: 'PO-AMZ' });
    const where = (findMany.mock.calls[0][0] as Row).where as { OR: Row[] };
    expect(where.OR).toContainEqual({ customerPoRef: { contains: 'PO-AMZ', mode: 'insensitive' } });
  });
});
