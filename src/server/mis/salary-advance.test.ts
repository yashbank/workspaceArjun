/** R2-324 — salary advances: Owner only, never on a closed month, audited without the amount. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES } from '@/lib/mis/roles';
import { EMP, fakeDb, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const { recordSalaryAdvance, deleteSalaryAdvance, listSalaryAdvances } = await import('./salary-advance');

beforeEach(() => {
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('R2-324 salary advances', () => {
  it('the Owner records one; the audit row names the person and month but never the amount', async () => {
    const { id } = await recordSalaryAdvance({ employeeId: EMP.id, year: 2026, month: 1, amount: 1500, notes: 'festival advance' });
    expect(state.salaryAdvances).toHaveLength(1);
    const audit = state.auditRows.find((r) => r.action === 'payrollAdvance.record')!;
    expect(audit).toMatchObject({ entityId: id, after: { employeeId: EMP.id, year: 2026, month: 1 } });
    expect(JSON.stringify(audit)).not.toContain('1500');
    await deleteSalaryAdvance(id);
    expect(state.salaryAdvances).toHaveLength(0);
  });
  it('refuses a zero / negative amount and a closed month', async () => {
    await expect(recordSalaryAdvance({ employeeId: EMP.id, year: 2026, month: 1, amount: 0 })).rejects.toThrow(/above zero/);
    state.payrollPeriods.push({ id: 'p1', year: 2026, month: 1, status: 'CLOSED' });
    await expect(recordSalaryAdvance({ employeeId: EMP.id, year: 2026, month: 1, amount: 100 })).rejects.toThrow(/closed/);
  });
  it.each(MIS_ROLES.filter((r) => r !== 'OWNER'))('%s is refused (wages.read)', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(listSalaryAdvances(2026, 1)).rejects.toThrow(/Not permitted: wages\.read/);
    await expect(recordSalaryAdvance({ employeeId: EMP.id, year: 2026, month: 1, amount: 100 })).rejects.toThrow(/Not permitted: wages\.read/);
    expect(state.salaryAdvances).toHaveLength(0);
  });
});
