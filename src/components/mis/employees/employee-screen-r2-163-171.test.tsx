/**
 * R2-163 Default shift field on the form; R2-171 Active/Inactive toggle distinct from Delete.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/(mis)/mis/employees/actions', () => {
  const ok = async () => ({ ok: true, value: { id: 'x' } });
  return { saveEmployeeAction: ok, deleteEmployeeAction: ok, restoreEmployeeAction: ok, setEmployeeActiveAction: ok, uploadEmployeePhotoAction: ok, importEmployeesCsvAction: ok };
});

const { EmployeeScreen } = await import('./employee-screen');

const emp = (over = {}) => ({
  id: 'e1', employeeCode: 'B1', name: 'Ramesh', nameHi: null, phone: null, role: 'WORKER', isActive: true, deletedAt: null,
  managerId: null, userProfile: null, wageTypeCode: null, payType: 'DAILY' as const, sundayPaid: false, ...over,
});
const base = { employees: [emp()], canWrite: true, scoped: false, isOwner: false, wageCodes: [], shifts: [{ id: 's1', name: 'Morning', startTime: '06:00', endTime: '14:00' }] };

describe('EmployeeScreen', () => {
  it('shows a Default shift picker on the form (R2-163)', () => {
    render(<EmployeeScreen {...base} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add Employee' }));
    expect(document.body.textContent).toContain('Default shift');
  });

  it('R2-250: a non-Owner sees why pay type and wage code are not on the form; the Owner gets the pay setup instead', () => {
    const { unmount } = render(<EmployeeScreen {...base} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add Employee' }));
    expect(document.body.textContent).toContain('Pay type and wage code are set by the Owner');
    expect(document.body.textContent).not.toContain('Pay setup');
    unmount();
    render(<EmployeeScreen {...base} isOwner />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add Employee' }));
    expect(document.body.textContent).toContain('Pay setup');
    expect(document.body.textContent).not.toContain('are set by the Owner');
  });

  it('has separate Deactivate and Delete buttons; an inactive person shows Activate (R2-171)', () => {
    const { unmount } = render(<EmployeeScreen {...base} />);
    expect(screen.getAllByRole('button', { name: 'Deactivate' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Delete' }).length).toBeGreaterThan(0);
    unmount();
    render(<EmployeeScreen {...base} employees={[emp({ isActive: false })]} />);
    expect(screen.getAllByRole('button', { name: 'Activate' }).length).toBeGreaterThan(0);
  });
});
