/** R2-406: payroll page is split into Register / Overview / Preflight / Exports & Banking tabs; panels stay in the DOM. */
import { fireEvent, render, screen } from '@testing-library/react';
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
const period = { year: 2026, month: 10, status: 'OPEN' as const, closedById: null, closedAt: null, correctionsAfterClose: 0, lastExportedById: null, lastExportedAt: null };
const ui = <PayrollScreen rows={[row]} year={2026} month={10} period={period} preflight={[{ id: 'a', label: 'All punches paired', ok: true }]} />;

const panel = (id: string) => document.getElementById(`panel-${id}`) as HTMLElement;

describe('PayrollScreen tabs', () => {
  it('defaults to Register; other panels are hidden but in the DOM', () => {
    render(ui);
    expect(screen.getByRole('tab', { name: 'Register' }).getAttribute('aria-selected')).toBe('true');
    expect(panel('register').hidden).toBe(false);
    for (const id of ['overview', 'preflight', 'exports']) expect(panel(id).hidden).toBe(true);
    expect(panel('register').querySelector('table')).toBeTruthy();
    expect(panel('overview').textContent).toContain('Working days');
    expect(panel('preflight').textContent).toContain('All punches paired');
    expect(panel('exports').textContent).toContain('Download wage ledger');
  });

  it('each tab shows its original block and switching works', () => {
    render(ui);
    fireEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(panel('overview').hidden).toBe(false);
    expect(panel('register').hidden).toBe(true);
    expect(screen.getByText('Corrections after close')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Preflight' }));
    expect(panel('preflight').hidden).toBe(false);
    expect(screen.getByText('Before export')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Exports & Banking' }));
    expect(panel('exports').hidden).toBe(false);
    expect(screen.getByRole('link', { name: /Download bank transfer file/ }).getAttribute('href')).toBe('/api/mis/payroll/bank-transfer?year=2026&month=10');
    expect(screen.getByRole('link', { name: /Download wage ledger/ }).getAttribute('href')).toBe('/api/mis/payroll/wage-ledger?year=2026&month=10');
    expect(screen.getByRole('link', { name: /Salary advances to recover/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Register' }));
    expect(panel('register').hidden).toBe(false);
  });
});
