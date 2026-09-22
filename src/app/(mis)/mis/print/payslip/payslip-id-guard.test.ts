/**
 * F-25 — a payslip id that is not a UUID is a 404 before any query, like every other [id] page.
 * Before the guard, /mis/print/payslip/none reached the database and the person saw "Something went wrong".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const requireMisAccess = vi.fn(async () => ({ id: 'u1' }));
const getMisRole = vi.fn(async () => 'OWNER');
const getEmployee = vi.fn(async () => null);
const calculateMonthlyPayroll = vi.fn(async () => []);

vi.mock('next/navigation', () => ({ notFound: () => notFound() }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: () => requireMisAccess() }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: () => getMisRole() }));
vi.mock('@/server/mis/employee', () => ({ getEmployee: () => getEmployee() }));
vi.mock('@/server/mis/payroll', () => ({ calculateMonthlyPayroll: () => calculateMonthlyPayroll() }));
vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));

const { default: PayslipPage } = await import('./[employeeId]/page');

const page = (employeeId: string) =>
  PayslipPage({ params: Promise.resolve({ employeeId }), searchParams: { year: '2026', month: '1' } });

beforeEach(() => vi.clearAllMocks());

describe('/mis/print/payslip/[employeeId]', () => {
  it.each(['none', 'e1', 'abc', '123', '', "1'; DROP TABLE x;--", '3f2b8c1e-9a4d-4e6b-8c7a-1d5e0f9a2b3'])(
    'a non-UUID id (%j) is a 404 and reaches no query, gate or server function',
    async (id) => {
      await expect(page(id)).rejects.toThrow('NEXT_NOT_FOUND');
      expect(notFound).toHaveBeenCalledTimes(1);
      expect(requireMisAccess).not.toHaveBeenCalled();
      expect(getMisRole).not.toHaveBeenCalled();
      expect(getEmployee).not.toHaveBeenCalled();
      expect(calculateMonthlyPayroll).not.toHaveBeenCalled();
    },
  );

  it('a well-formed id goes on to the gate and the queries (an unknown employee is still a 404, but a real one)', async () => {
    await expect(page('3f2b8c1e-9a4d-4e6b-8c7a-1d5e0f9a2b34')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(getEmployee).toHaveBeenCalledTimes(1);
    expect(calculateMonthlyPayroll).toHaveBeenCalledTimes(1);
  });
});
