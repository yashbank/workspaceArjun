/**
 * Customer validation test suite: Phone number and GST number validation guards.
 *
 * Requirements:
 * 1. Customer phone number must reject invalid formats, excessive characters, and letters (e.g. '86690010040000sadasd').
 * 2. Customer GST number must reject invalid formats and non-standard lengths (e.g. '27ABCDE1234F1Z5sdasdasd').
 * 3. Both createCustomer and updateCustomer (as well as saveCustomerAction) must guard these fields.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const state: { customers: Row[]; audits: Row[] } = {
  customers: [],
  audits: [],
};
let seq = 0;

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/mis/audit', () => ({
  logAuditEvent: async (e: Row) => {
    state.audits.push(e);
  },
}));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const byId = (rows: Row[], where: Row) => rows.find((r) => r.id === where.id) ?? null;

vi.mock('@/server/db', () => ({
  db: {
    misCustomer: {
      findUnique: async ({ where }: Row) => {
        const c = byId(state.customers, where);
        return c ? { ...c } : null;
      },
      create: async ({ data }: Row) => {
        const row = { id: `c${++seq}`, deletedAt: null, isActive: true, ...data };
        state.customers.push(row);
        return { ...row };
      },
      update: async ({ where, data }: Row) => {
        const row = byId(state.customers, where);
        if (!row) throw new Error('Customer not found');
        Object.assign(row, data);
        return { ...row };
      },
      findMany: async () => state.customers.map((c) => ({ ...c })),
    },
    misOrder: {
      findMany: async () => [],
    },
  },
}));

const { createCustomer, updateCustomer } = await import('./customer');
const { saveCustomerAction } = await import('@/app/(mis)/mis/customers/actions');

const as = (role: string) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};

beforeEach(() => {
  state.customers = [];
  state.audits = [];
  seq = 0;
  vi.clearAllMocks();
  as('ADMIN');
});

describe('Customer phone number validation', () => {
  it('rejects phone number containing letters and invalid length like "86690010040000sadasd" on create', async () => {
    await expect(
      createCustomer({
        code: 'CUST-01',
        name: 'Test Customer',
        phone: '86690010040000sadasd',
      }),
    ).rejects.toThrow(/invalid phone|phone number/i);
    expect(state.customers).toHaveLength(0);
  });

  it('rejects phone number containing letters and invalid length on update', async () => {
    state.customers.push({
      id: 'c1',
      code: 'CUST-01',
      name: 'Existing Customer',
      phone: '9876543210',
      deletedAt: null,
    });

    await expect(
      updateCustomer('c1', {
        phone: '86690010040000sadasd',
      }),
    ).rejects.toThrow(/invalid phone|phone number/i);
    expect(state.customers[0].phone).toBe('9876543210');
  });

  it('rejects phone number with non-numeric characters like "98765abcde"', async () => {
    await expect(
      createCustomer({
        code: 'CUST-02',
        name: 'Alpha Phone Customer',
        phone: '98765abcde',
      }),
    ).rejects.toThrow(/invalid phone|phone number/i);
  });

  it('accepts valid 10-digit Indian phone number', async () => {
    const created = await createCustomer({
      code: 'CUST-OK',
      name: 'Valid Phone Customer',
      phone: '9876543210',
    });
    expect(created.phone).toBe('9876543210');
  });

  it('accepts empty or null phone number as optional', async () => {
    const created = await createCustomer({
      code: 'CUST-EMPTY',
      name: 'No Phone Customer',
      phone: null,
    });
    expect(created.phone).toBeNull();
  });
});

describe('Customer GSTIN validation', () => {
  it('rejects GST number with invalid length and trailing letters like "27ABCDE1234F1Z5sdasdasd" on create', async () => {
    await expect(
      createCustomer({
        code: 'CUST-GST-01',
        name: 'Test GST Customer',
        gstNo: '27ABCDE1234F1Z5sdasdasd',
      }),
    ).rejects.toThrow(/invalid gst|gst number|gstin/i);
    expect(state.customers).toHaveLength(0);
  });

  it('rejects GST number with invalid length and trailing letters on update', async () => {
    state.customers.push({
      id: 'c1',
      code: 'CUST-GST-01',
      name: 'Existing Customer',
      gstNo: '27ABCDE1234F1Z5',
      deletedAt: null,
    });

    await expect(
      updateCustomer('c1', {
        gstNo: '27ABCDE1234F1Z5sdasdasd',
      }),
    ).rejects.toThrow(/invalid gst|gst number|gstin/i);
    expect(state.customers[0].gstNo).toBe('27ABCDE1234F1Z5');
  });

  it('rejects malformed GST format like "12345XYZ"', async () => {
    await expect(
      createCustomer({
        code: 'CUST-GST-BAD',
        name: 'Bad GST Customer',
        gstNo: '12345XYZ',
      }),
    ).rejects.toThrow(/invalid gst|gst number|gstin/i);
  });

  it('accepts valid 15-character GSTIN format', async () => {
    const created = await createCustomer({
      code: 'CUST-GST-OK',
      name: 'Valid GST Customer',
      gstNo: '27ABCDE1234F1Z5',
    });
    expect(created.gstNo).toBe('27ABCDE1234F1Z5');
  });

  it('accepts empty or null GST number as optional', async () => {
    const created = await createCustomer({
      code: 'CUST-GST-NONE',
      name: 'No GST Customer',
      gstNo: null,
    });
    expect(created.gstNo).toBeNull();
  });
});

describe('Customer server action returns validation failure as ActionResult value', () => {
  it('saveCustomerAction returns ok: false when phone number contains invalid characters', async () => {
    const res = await saveCustomerAction(null, {
      code: 'CUST-ACT-01',
      name: 'Action Test',
      phone: '86690010040000sadasd',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.detail).toMatch(/invalid phone|phone number/i);
    }
  });

  it('saveCustomerAction returns ok: false when GST number format is invalid', async () => {
    const res = await saveCustomerAction(null, {
      code: 'CUST-ACT-02',
      name: 'Action Test GST',
      gstNo: '27ABCDE1234F1Z5sdasdasd',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.detail).toMatch(/invalid gst|gst number|gstin/i);
    }
  });
});
