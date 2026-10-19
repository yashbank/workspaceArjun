/**
 * R3-SEC B38 (component), B39 (audit page), B42 (asResult per actions file), B49 (payslip), B50 (no toLocale).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notFound = vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); });
vi.mock('next/navigation', () => ({ notFound: () => notFound(), redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'OWNER' }));
const findMany = vi.fn(async (..._a: unknown[]) => [] as unknown[]);
vi.mock('@/server/db', () => ({ db: { misAuditLog: { findMany: (...a: unknown[]) => findMany(...a), count: async () => 0 } } }));
vi.mock('@/server/mis/auth', async () => {
  const actual = await vi.importActual<typeof import('@/server/mis/auth')>('@/server/mis/auth');
  return { ...actual, requirePermission: async () => ({ userId: 'u1', role: 'OWNER' }) };
});
vi.mock('@/components/mis/audit/audit-screen', () => ({ AuditScreen: () => null }));
const getEmployee = vi.fn(async (..._a: unknown[]) => null);
const calculateMonthlyPayroll = vi.fn(async (..._a: unknown[]) => [] as unknown[]);
vi.mock('@/server/mis/payroll', () => ({
  calculateMonthlyPayroll: (...a: unknown[]) => calculateMonthlyPayroll(...a),
  // R2-112: the payslip computes one employee's line; same spy, so "no query" assertions still hold.
  calculateEmployeePayroll: (...a: unknown[]) => calculateMonthlyPayroll(...a),
}));
vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));

// The server functions every actions file wraps - each one refuses with a plain Error.
const boom = async () => { throw new Error('refused in words'); };
vi.mock('@/server/mis/employee-photo', () => ({ setEmployeePhoto: boom }));
vi.mock('@/server/mis/users', () => ({ grantMisRole: boom, inviteMisUser: boom }));
vi.mock('@/server/mis/business-rules', () => ({ updateBusinessRule: boom }));
vi.mock('@/server/mis/wage-type', () => ({ addWageRate: boom, createWageType: boom, setWageTypeActive: boom }));
vi.mock('@/server/mis/payroll-period', () => ({ closePayrollPeriod: boom, recordPayrollExport: boom }));
vi.mock('@/server/mis/extra-pay-days', () => ({ proposeExtraPayDay: boom }));

vi.mock('@/server/mis/employee', () => ({
  getEmployee: (...a: unknown[]) => getEmployee(...a),
  createEmployee: boom, updateEmployee: boom, deleteEmployee: boom, restoreEmployee: boom,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('B42 every export of the actions files returns an ActionResult', () => {
  const refused = { ok: false, detail: 'refused in words' };

  it('employees/actions.ts', async () => {
    const a = await import('@/app/(mis)/mis/employees/actions');
    expect(await a.saveEmployeeAction(null, { employeeCode: 'x', name: 'x' })).toEqual(refused);
    expect(await a.saveEmployeeAction('id', { employeeCode: 'x', name: 'x' })).toEqual(refused);
    expect(await a.deleteEmployeeAction('id')).toEqual(refused);
    expect(await a.restoreEmployeeAction('id')).toEqual(refused);
    const fd = new FormData();
    fd.set('photo', new File([new Uint8Array([1])], 'p.png', { type: 'image/png' }));
    expect(await a.uploadEmployeePhotoAction('id', fd)).toEqual(refused);
  });

  it('settings/actions.ts', async () => {
    const a = await import('@/app/(mis)/mis/settings/actions');
    expect(await a.updateRuleAction('k', 'v')).toEqual(refused);
  });

  it('settings/users/actions.ts', async () => {
    const a = await import('@/app/(mis)/mis/settings/users/actions');
    expect(await a.inviteMisUserAction('a@b.c', 'QC')).toEqual(refused);
    expect(await a.grantMisRoleAction('p', 'QC')).toEqual(refused);
  });

  it('settings/wages/actions.ts', async () => {
    const a = await import('@/app/(mis)/mis/settings/wages/actions');
    expect(await a.createWageTypeAction({ name: 'n', unit: 'DAILY', amount: 1 })).toEqual(refused);
    expect(await a.addWageRateAction('c', 1)).toEqual(refused);
    expect(await a.setWageTypeActiveAction('c', true)).toEqual(refused);
  });

  it('payroll/actions.ts', async () => {
    const a = await import('@/app/(mis)/mis/payroll/actions');
    expect(await a.closePayrollPeriodAction(2026, 1)).toEqual(refused);
    expect(await a.recordPayrollExportAction(2026, 1)).toEqual(refused);
  });

  it('attendance/extra-pay/actions.ts', async () => {
    const a = await import('@/app/(mis)/mis/attendance/extra-pay/actions');
    expect(await a.proposeExtraPayDayAction({ date: '2026-01-01', kind: 'FLAT_AMOUNT', value: 1, scope: 'ALL_PRESENT', reason: 'x' })).toEqual(refused);
  });
});

describe('B39 the audit page (R2-83: 25 a page, filters in the URL)', () => {
  it('?page=abc&from=zzz renders the first page with no date filter', async () => {
    const { default: AuditPage } = await import('@/app/(mis)/mis/audit/page');
    await AuditPage({ searchParams: Promise.resolve({ page: 'abc', from: 'zzz', to: '2026-13-99x' }) });
    const args = findMany.mock.calls[0][0] as { take: number; skip: number; where: Record<string, unknown> };
    expect(args.take).toBe(25);
    expect(args.skip).toBe(0);
    expect(args.where.createdAt).toBeUndefined();
  });

  it.each([['0', 0], ['-5', 0], ['1', 0], ['3', 50]])('page %s skips %i rows', async (page, skip) => {
    const { default: AuditPage } = await import('@/app/(mis)/mis/audit/page');
    await AuditPage({ searchParams: Promise.resolve({ page }) });
    expect((findMany.mock.calls[0][0] as { skip: number; take: number })).toMatchObject({ skip, take: 25 });
  });

  it('a well-formed date range is used', async () => {
    const { default: AuditPage } = await import('@/app/(mis)/mis/audit/page');
    await AuditPage({ searchParams: Promise.resolve({ from: '2026-01-01', to: '2026-01-31' }) });
    expect((findMany.mock.calls[0][0] as { where: { createdAt: object } }).where.createdAt).toBeDefined();
  });
});

describe('B49 the payslip page', () => {
  const UUID = '3f2b8c1e-9a4d-4e6b-8c7a-1d5e0f9a2b34';
  const page = async (sp: { year?: string; month?: string }) => {
    const { default: PayslipPage } = await import('@/app/(mis)/mis/print/payslip/[employeeId]/page');
    return PayslipPage({ params: Promise.resolve({ employeeId: UUID }), searchParams: sp });
  };

  it.each([{ month: 'abc' }, { month: '13' }, { month: '0' }, { year: '1999' }, { year: '2101', month: '1' }, { year: 'x' }])(
    '%j is a 404 before any query',
    async (sp) => {
      await expect(page(sp)).rejects.toThrow('NEXT_NOT_FOUND');
      expect(getEmployee).not.toHaveBeenCalled();
      expect(calculateMonthlyPayroll).not.toHaveBeenCalled();
    },
  );

  it('asks for the minimal payslip view of the employee', async () => {
    await expect(page({ year: '2026', month: '1' })).rejects.toThrow('NEXT_NOT_FOUND'); // unknown employee
    expect(getEmployee).toHaveBeenCalledWith(UUID, 'payslip');
  });
});

describe('B38 the classic traceability screen renders unsafe links as text', () => {
  it('a javascript: filePath has no anchor; an https one does', async () => {
    const trace = {
      order: { id: 'o1', orderNumber: 'ORD-1', description: null, status: 'COMPLETE' },
      documents: [
        { id: 'd1', name: 'Evil doc', filePath: 'javascript:alert(1)' },
        { id: 'd2', name: 'Good doc', filePath: 'https://example.com/a.pdf' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => new Proxy(trace, { get: (t, k) => (k in t ? (t as never)[k] : k === 'totalProduced' || k === 'totalWaste' ? 0 : []) }) })));
    const { TraceabilityScreen } = await import('@/components/mis/traceability/traceability-screen');
    const { container } = render(<TraceabilityScreen orders={[{ id: 'o1', orderNumber: 'ORD-1', description: null, status: 'COMPLETE' }]} />);
    fireEvent.change(container.querySelector('select')!, { target: { value: 'o1' } });
    await waitFor(() => expect(screen.getByText('Evil doc')).toBeTruthy());
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://example.com/a.pdf');
    expect(hrefs.some((h) => h?.startsWith('javascript:'))).toBe(false);
    expect(screen.getByText('javascript:alert(1)').tagName).toBe('SPAN');
    vi.unstubAllGlobals();
  });
});

describe('B50 no toLocale* in the payroll and extra-pay screens', () => {
  it.each([
    'src/components/mis/payroll/payroll-screen.tsx',
    'src/components/mis/payroll/wage-type-screen.tsx',
    'src/components/mis/payroll/wage-picker.tsx',
    'src/components/mis/attendance/extra-pay-propose-screen.tsx',
    'src/app/(mis)/mis/print/payslip/[employeeId]/page.tsx',
  ])('%s', (file) => {
    expect(readFileSync(file, 'utf8')).not.toMatch(/toLocale|getFullYear|toISOString\(\)\.slice/);
  });
});
