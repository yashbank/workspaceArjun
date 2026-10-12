/**
 * C3 · D5 — Add Item and BOM material writes: a price/rate is accepted only from a role holding `wages.read`,
 * and the audit row never carries it for anyone else.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MisRoleName } from '@/lib/mis/roles';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows for an in-memory fake
type Row = Record<string, any>;
const itemCreates: Row[] = [];
const materialCreates: Row[] = [];
const audits: Row[] = [];

vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
vi.mock('@/server/db', () => ({
  db: {
    misItem: {
      count: async () => 0,
      create: async ({ data }: Row) => { itemCreates.push(data); return { id: 'i1', ...data }; },
    },
    misBomStage: { findUnique: async () => ({ id: 's1', bom: { status: 'DRAFT' } }) },
    misBom: { findUnique: async () => ({ id: 'b1', status: 'DRAFT' }) },
    misBomMaterial: {
      create: async ({ data }: Row) => { materialCreates.push(data); return { id: 'm1', ...data }; },
      findUnique: async () => ({ id: 'm1', stageId: 's1', description: 'Board', quantity: 1, unit: 'Kg', ratePerUnit: 55.5, stage: { bom: { status: 'DRAFT' } } }),
      update: async ({ data }: Row) => ({ id: 'm1', description: 'Board', quantity: 1, unit: 'Kg', ratePerUnit: data.ratePerUnit ?? 55.5 }),
    },
  },
}));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: async (e: Row) => { audits.push(e); } }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/notifications', () => ({ notifyRoles: async () => undefined }));

const { createItemAction } = await import('@/app/(mis)/mis/inventory/actions');
const { addBomMaterial } = await import('./bom');

const as = (role: MisRoleName) => { getCurrentUser.mockResolvedValue({ id: 'u1' }); getMisRole.mockResolvedValue(role); };
const base = { name: 'Kraft', category: 'RAW_MATERIAL', unit: 'KG', pricePerUnit: '250' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  itemCreates.length = 0;
  materialCreates.length = 0;
  audits.length = 0;
});

describe('Add Item (createItemAction)', () => {
  it('the OWNER may set the price', async () => {
    as('OWNER');
    await createItemAction(base);
    expect(itemCreates[0].pricePerUnit).toBe(250);
  });

  it('ADMIN creates the item but the price is dropped and never audited', async () => {
    as('ADMIN');
    await createItemAction(base);
    expect(itemCreates[0].pricePerUnit).toBeNull();
    expect(JSON.stringify(audits[0])).not.toMatch(/pricePerUnit/);
  });
});

describe('BOM material writes', () => {
  const data = { description: 'Board', quantity: 1, unit: 'Kg', ratePerUnit: 55.5, seq: 0 };

  it('ADMIN: the rate is not stored and not returned (so it can never reach an audit row either)', async () => {
    as('ADMIN');
    const out = await addBomMaterial('s1', data);
    expect('ratePerUnit' in materialCreates[0]).toBe(false);
    expect(JSON.stringify(audits[0] ?? {})).not.toContain('ratePerUnit');
    expect(JSON.stringify(out)).not.toContain('ratePerUnit');
  });

  it('OWNER: the rate is stored (the audit writer masks it at rest — see material-money.test.ts)', async () => {
    as('OWNER');
    await addBomMaterial('s1', data);
    expect(materialCreates[0].ratePerUnit).toBe(55.5);
  });
});
