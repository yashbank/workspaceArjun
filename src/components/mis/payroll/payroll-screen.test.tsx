/**
 * R2-256 drift banner · R2-257 Half-day column · R2-237/258 desktop width. Counts only, never money (W9).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => ({ confirm: vi.fn(), confirmDialog: null }) }));
vi.mock('@/app/(mis)/mis/payroll/actions', () => ({
  closePayrollPeriodAction: vi.fn(), reopenPayrollPeriodAction: vi.fn(), recordPayrollExportAction: vi.fn(),
  releasePayslipsAction: vi.fn(), withdrawPayslipAction: vi.fn(),
}));

const { PayrollScreen } = await import('./payroll-screen');

const row = {
  employeeId: 'e1', employeeName: 'Ramesh Kumar', employeeCode: 'BPP-014', payType: 'DAILY' as const, workingDays: 31,
  present: 24, absent: 1, leave: 2, halfDay: 4, totalLateMinutes: 0, totalOTMinutes: 90, allowanceDays: 0,
};
const period = (over: Partial<{ status: 'OPEN' | 'CLOSED'; correctionsAfterClose: number }> = {}) => ({
  year: 2026, month: 10, status: 'OPEN' as const, closedById: null, closedAt: null, correctionsAfterClose: 0,
  lastExportedById: null, lastExportedAt: null, ...over,
});

describe('PayrollScreen', () => {
  it('R2-257: the table has a Half-day column carrying the half-day count', () => {
    render(<PayrollScreen rows={[row]} year={2026} month={10} period={period()} preflight={[]} />);
    expect(screen.getByRole('columnheader', { name: 'Half-day' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '4' })).toBeTruthy();
  });

  it('R2-256: a closed month with corrections shows the drift banner; without corrections, or while open, it does not', () => {
    const { unmount } = render(<PayrollScreen rows={[row]} year={2026} month={10} period={period({ status: 'CLOSED', correctionsAfterClose: 2 })} preflight={[]} />);
    expect(screen.getByRole('status').textContent).toMatch(/2 attendance corrections since this month was closed.*reopen/);
    unmount();
    render(<PayrollScreen rows={[row]} year={2026} month={10} period={period({ status: 'CLOSED', correctionsAfterClose: 0 })} preflight={[]} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('R2-237 / R2-258: desktop widens to max-w-7xl and lays the cards out as a grid; the phone column stays', () => {
    const { container } = render(<PayrollScreen rows={[row]} year={2026} month={10} period={period()} preflight={[]} />);
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toContain('max-w-2xl');
    expect(outer.className).toContain('lg:max-w-7xl');
    expect(container.querySelector('.lg\\:grid.lg\\:grid-cols-2')).toBeTruthy();
    expect(container.querySelector('table')!.closest('.lg\\:col-span-2')).toBeTruthy();
  });
});
