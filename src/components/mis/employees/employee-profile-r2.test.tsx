// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(mis)/mis/employees/[id]/actions', () => ({ setPayComponentAction: vi.fn() }));
vi.mock('@/app/(mis)/mis/employees/actions', () => ({ uploadEmployeePhotoAction: vi.fn() }));

import { EmployeeProfileScreen } from './employee-profile-screen';

afterEach(cleanup);

const base = {
  employee: { id: 'e1', name: 'Asha Rao', code: 'EMP001', role: 'WORKER', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
  monthStats: { present: 1, absent: 0, leave: 0, totalOT: 0 },
  month: '2026-10',
  timezone: 'Asia/Kolkata',
  payComponents: null,
};
const hrefOf = (name: RegExp) => screen.getByText(name).closest('a')?.getAttribute('href');

describe('employee profile (R2-88 / R2-89)', () => {
  it('writers get an Edit button that opens the edit form on this person', () => {
    render(<EmployeeProfileScreen {...base} canWrite />);
    expect(hrefOf(/Edit Employee/)).toBe('/mis/employees?edit=e1');
  });
  it('no Edit button without employees.write', () => {
    render(<EmployeeProfileScreen {...base} canWrite={false} />);
    expect(screen.queryByText(/Edit Employee/)).toBeNull();
  });
  it('the payslip link is for the Owner only and carries the shown month', () => {
    render(<EmployeeProfileScreen {...base} canWrite canViewPayslip />);
    expect(hrefOf(/View Payslip/)).toBe('/mis/print/payslip/e1?year=2026&month=10');
    cleanup();
    render(<EmployeeProfileScreen {...base} canWrite />);
    expect(screen.queryByText(/View Payslip/)).toBeNull();
  });
});
