/**
 * Phase 24C · F-06 — `getOrderTrace` carries a BOM tree, so it carries the same rule as `getBom`:
 * a material's `ratePerUnit` is money (D24) and only a role holding `wages.read` receives it.
 * Found by the D6 check: the trace did its own `misBom` query and handed ADMIN, SUPERVISOR and QC
 * every rate, one route round the fix in `getBom`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
const world: { bom: Row | null } = { bom: null };

vi.mock('@/server/db', () => ({
  db: {
    misOrder: { findUnique: async () => ({ id: 'o1', orderNumber: 'ORD-1', customer: null }) },
    misBom: { findUnique: async () => world.bom },
    misProductionLog: { findMany: async () => [] },
    misQcCheck: { findMany: async () => [] },
    misDocument: { findMany: async () => [] },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/qc', () => ({ withCheckerNames: async (rows: unknown[]) => rows }));
vi.mock('@/server/mis/documents', () => ({ withUploaderNames: async (rows: unknown[]) => rows }));

const { getOrderTrace } = await import('./traceability');

const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'];
const RATE = 159.35;
const as = (role: MisRoleName) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};

beforeEach(() => {
  vi.clearAllMocks();
  world.bom = {
    id: 'b1', status: 'APPROVED',
    stages: [{ id: 's1', stageName: 'Print', seq: 0, process: null, materials: [
      { id: 'm1', description: 'FBB board', quantity: 1240, unit: 'Kg', ratePerUnit: RATE, seq: 0, item: null },
    ] }],
  };
});

describe('getOrderTrace — the BOM rate is Owner-only (F-06)', () => {
  it('the OWNER still receives the rate', async () => {
    as('OWNER');
    const t = await getOrderTrace('o1');
    expect((t.bom!.stages[0].materials[0] as Row).ratePerUnit).toBe(RATE);
  });

  it.each(READERS.filter((r) => r !== 'OWNER'))('%s gets the structure and quantities but NO rate — the key is absent', async (role) => {
    as(role);
    const t = await getOrderTrace('o1');
    const material = t.bom!.stages[0].materials[0] as Row;
    expect(material).toMatchObject({ description: 'FBB board', quantity: 1240, unit: 'Kg' });
    expect('ratePerUnit' in material).toBe(false);
    expect(JSON.stringify(t)).not.toContain(String(RATE));
  });

  it.each(MIS_ROLES.filter((r) => !READERS.includes(r)))('%s is refused outright', async (role) => {
    as(role);
    await expect(getOrderTrace('o1')).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });

  it('an order with no BOM still answers (bom: null) for every reader', async () => {
    world.bom = null;
    for (const role of READERS) {
      as(role);
      expect((await getOrderTrace('o1')).bom).toBeNull();
    }
  });
});
