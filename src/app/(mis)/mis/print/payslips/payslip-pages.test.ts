/**
 * R2-109 / R2-111 pages: the Owner's bulk print and the employee's own released slip.
 * Server functions are mocked here — their own rules are proven in server/mis/payslips.test.ts;
 * this pins what each PAGE does with the role and the URL.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES } from '@/lib/mis/roles';
import { propsPayload, findLeaks } from '@/server/mis/testing/wage-world';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const requireMisAccess = vi.fn(async () => ({ id: 'u1' }));
const getMisRole = vi.fn(async (): Promise<string> => 'OWNER');
const getPayslipBatch = vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []);
const getMyPayslip = vi.fn(async (..._a: unknown[]): Promise<unknown> => null);
const listMyPayslips = vi.fn(async (): Promise<unknown[]> => []);

vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: () => requireMisAccess() }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: () => getMisRole() }));
vi.mock('@/server/mis/payslips', () => ({
  getPayslipBatch: (...a: unknown[]) => getPayslipBatch(...a),
  getMyPayslip: (...a: unknown[]) => getMyPayslip(...a),
  listMyPayslips: () => listMyPayslips(),
}));
vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));

const { default: BulkPayslipPage } = await import('./page');
const { default: MyPayslipPage } = await import('../my-payslip/page');
const { default: MyPayslipsPage } = await import('../../me/payslips/page');

const row = (employeeId: string, grossPay: number) => ({
  employeeId, employeeName: employeeId, employeeCode: employeeId, payType: 'DAILY', workingDays: 31, present: 3, absent: 0, leave: 0, halfDay: 0,
  totalLateMinutes: 0, totalOTMinutes: 0, allowanceDays: 0, basicWage: grossPay, hra: 0, allowance: 0, otPay: 0, bonus: 0, extraPay: 0, latePenalty: 0, grossPay, wageTypeCode: null,
});
const doc = (id: string, grossPay: number) => ({ employee: { id, name: id, employeeCode: id, role: 'WORKER', departmentName: null }, row: row(id, grossPay) });

beforeEach(() => {
  vi.clearAllMocks();
  getMisRole.mockResolvedValue('OWNER');
});

describe('R2-109 — /mis/print/payslips (bulk)', () => {
  const bulk = (sp: Record<string, string>) => BulkPayslipPage({ searchParams: Promise.resolve(sp) });

  it('OWNER: one batch call for the month, one sheet per slip, page breaks between them', async () => {
    getPayslipBatch.mockResolvedValue([doc('E-001', 2270), doc('E-002', 731)]);
    const tree = propsPayload(await bulk({ year: '2026', month: '1' }));
    expect(getPayslipBatch).toHaveBeenCalledTimes(1);
    expect(getPayslipBatch).toHaveBeenCalledWith(2026, 1);
    const text = JSON.stringify(tree);
    expect(text).toContain('"grossPay":2270');
    expect(text).toContain('"grossPay":731');
    expect(text.match(/"pageBreak":true/g)).toHaveLength(1); // between two slips, not after the last
  });

  it.each(MIS_ROLES.filter((r) => r !== 'OWNER'))('%s is refused before any payslip is computed', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(bulk({ year: '2026', month: '1' })).rejects.toThrow(/Not permitted: wages\.read/);
    expect(getPayslipBatch).not.toHaveBeenCalled();
  });

  it.each([{ year: '2026', month: '13' }, { year: 'abc', month: '1' }, { year: '1999', month: '1' }])('a nonsense month %j is a 404', async (sp) => {
    await expect(bulk(sp)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getPayslipBatch).not.toHaveBeenCalled();
  });
});

describe('R2-111 — /mis/print/my-payslip (the employee’s own released slip)', () => {
  const mine = (sp: Record<string, string>) => MyPayslipPage({ searchParams: Promise.resolve(sp) });

  it.each(MIS_ROLES)('as %s: renders the slip the server hands back for the login — the URL carries no employee id', async (role) => {
    getMisRole.mockResolvedValue(role);
    getMyPayslip.mockResolvedValue(doc('E-001', 2270));
    const text = JSON.stringify(propsPayload(await mine({ year: '2026', month: '1', employeeId: 'someone-else' })));
    expect(getMyPayslip).toHaveBeenCalledWith(2026, 1); // employeeId in the URL is ignored
    expect(text).toContain('"grossPay":2270');
  });

  it('a slip that was not sent / current month / not closed (server returns null) is a 404', async () => {
    getMyPayslip.mockResolvedValue(null);
    await expect(mine({ year: '2026', month: '9' })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('a missing or nonsense month is a 404 without asking the server', async () => {
    await expect(mine({})).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(mine({ year: '2026', month: '0' })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getMyPayslip).not.toHaveBeenCalled();
  });
});

describe('R2-111 — /mis/me/payslips (the list)', () => {
  it('lists months only — no figure, no wage word, for any role', async () => {
    listMyPayslips.mockResolvedValue([{ year: 2026, month: 1, releasedAt: new Date('2026-02-02T05:00:00Z') }]);
    for (const role of MIS_ROLES) {
      getMisRole.mockResolvedValue(role);
      const tree = propsPayload(await MyPayslipsPage());
      expect(JSON.stringify(tree)).toContain('/mis/print/my-payslip?year=2026&month=1');
      expect(findLeaks(tree, { keys: /wage|salary|gross|amount|rate/i, values: [], words: /wage|salary|₹/i })).toEqual([]);
    }
  });
});
