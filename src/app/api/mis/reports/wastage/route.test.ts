/**
 * D7's Export CSV route: thin. It calls the SAME server function the screen calls, and maps the
 * function's refusal to a status — the gate itself lives in `getWastageReport` (wastage-report.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWastage } from '@/lib/mis/wastage';

const getWastageReport = vi.fn();
vi.mock('@/server/mis/reports', () => ({ getWastageReport: (...a: unknown[]) => getWastageReport(...a) }));

const { GET } = await import('./route');

const report = buildWastage(
  [{ loggedAt: new Date('2026-09-08T06:00:00Z'), qtyProduced: 1000, qtyWaste: 31, unit: 'KG', machineId: 'm', machineName: 'M', orderId: 'o1', orderNumber: 'ORD-1', description: 'Duplex', phaseName: 'Printing' }],
  { timeZone: 'Asia/Kolkata', lastKey: '2026-09-10', weeks: 4 },
);
const call = (qs = '') => GET(new Request(`http://x/api/mis/reports/wastage${qs}`));

beforeEach(() => {
  vi.clearAllMocks();
  getWastageReport.mockResolvedValue(report);
});

describe('GET /api/mis/reports/wastage', () => {
  it('returns the report as a CSV attachment, no-store', async () => {
    const res = await call('?weeks=4');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="wastage-weekly-2026-08-17_2026-09-10.csv"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toContain('Week starting,Phase,Waste,Unit');
  });

  it('passes the filters through to the SAME function the screen uses', async () => {
    await call('?weeks=13&machine=m9&unit=NOS');
    expect(getWastageReport).toHaveBeenCalledWith({ weeks: 13, machineId: 'm9', unit: 'NOS' });
  });

  it('part=orders exports the orders table; an unknown part falls back to the chart', async () => {
    expect(await (await call('?part=orders')).text()).toContain('Order,Item,Waste,Output,% of output,Unit');
    expect(await (await call('?part=../../etc')).text()).toContain('Week starting');
  });

  it('a refused caller gets 403 and no data', async () => {
    getWastageReport.mockRejectedValue(Object.assign(new Error('nope'), { name: 'MisForbiddenError' }));
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain('Week starting');
  });

  it('any other failure is a 500 that does not echo the error text', async () => {
    getWastageReport.mockRejectedValue(new Error('connection string postgres://secret'));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('postgres');
  });
});
