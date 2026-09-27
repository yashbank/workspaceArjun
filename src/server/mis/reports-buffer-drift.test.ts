/**
 * Phase 21 · D1 — `getBufferDriftReport`'s bucketing, at the server function.
 *
 * Value received on BUFFER_STOCK POs vs FOR_ORDER POs, for the same period, bucketed by the
 * PO's own `purpose` column (this phase's own schema change) — never a third "unassigned" group.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
/** A minimal Prisma-Decimal stand-in for every `.toNumber()` call site in the report. */
const D = (n: number) => ({ toNumber: () => n, valueOf: () => n });

let grnItems: Row[] = [];

function makeDb(): Row {
  return {
    misGrnItem: {
      findMany: async ({ where }: Row) => {
        const from = where?.grn?.receivedAt?.gte;
        const to = where?.grn?.receivedAt?.lte;
        return grnItems.filter((gi) => {
          const at = gi.grn.receivedAt;
          if (from && at < from) return false;
          if (to && at > to) return false;
          return true;
        });
      },
    },
  };
}

let fakeDb = makeDb();
vi.mock('@/server/db', () => ({ get db() { return fakeDb; } }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { getBufferDriftReport } = await import('./reports');

const RANGE = { from: new Date('2026-01-01'), to: new Date('2026-01-31') };

beforeEach(() => {
  fakeDb = makeDb();
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  grnItems = [];
});

describe('getBufferDriftReport (D1)', () => {
  it("buckets every GRN line by its PO's purpose, never leaving one unassigned", async () => {
    grnItems = [
      { receivedQty: D(10), grn: { receivedAt: new Date('2026-01-05') }, poItem: { ratePerUnit: D(100), po: { purpose: 'BUFFER_STOCK' } } }, // 1000
      { receivedQty: D(5), grn: { receivedAt: new Date('2026-01-10') }, poItem: { ratePerUnit: D(200), po: { purpose: 'FOR_ORDER' } } }, // 1000
      { receivedQty: D(2), grn: { receivedAt: new Date('2026-01-15') }, poItem: { ratePerUnit: D(50), po: { purpose: 'BUFFER_STOCK' } } }, // 100
    ];
    const report = await getBufferDriftReport(RANGE);
    expect(report.bufferStock).toEqual({ valueReceived: 1100, grnItemCount: 2 });
    expect(report.forOrder).toEqual({ valueReceived: 1000, grnItemCount: 1 });
    expect(report.drift).toBe(100);
  });

  it('a legacy PO with no purpose recorded reads as buffer stock, matching lib/mis/po-purpose.ts', async () => {
    grnItems = [
      { receivedQty: D(1), grn: { receivedAt: new Date('2026-01-05') }, poItem: { ratePerUnit: D(500), po: { purpose: null } } },
    ];
    const report = await getBufferDriftReport(RANGE);
    expect(report.bufferStock.valueReceived).toBe(500);
    expect(report.forOrder.grnItemCount).toBe(0);
  });

  it('excludes GRN lines received outside the range', async () => {
    grnItems = [
      { receivedQty: D(1), grn: { receivedAt: new Date('2025-12-31') }, poItem: { ratePerUnit: D(999), po: { purpose: 'BUFFER_STOCK' } } },
    ];
    const report = await getBufferDriftReport(RANGE);
    expect(report.bufferStock.valueReceived).toBe(0);
    expect(report.forOrder.valueReceived).toBe(0);
  });

  it('is refused for a role without wages.read (D24, F-06 — this report is all money)', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    await expect(getBufferDriftReport(RANGE)).rejects.toThrow();
  });
});
