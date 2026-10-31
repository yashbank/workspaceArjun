/**
 * R2-165/166 attendance toolbar + past-day Clock In, R2-167/168 leave screen, R2-170 shifts screen.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/(mis)/mis/attendance/actions', () => {
  const ok = async () => ({ ok: true, value: { skipped: [], skippedDates: [] } });
  return {
    clockInAction: ok, clockOutAction: ok, approveClockOutAction: ok, editAttendanceAction: ok, markAbsentBulkAction: ok,
    bulkPunchAction: ok, listPunchesForDayAction: ok, addAttendanceNoteAction: ok, requestLeaveAction: ok, approveLeaveAction: ok,
    cancelLeaveRequestAction: ok, saveShiftAction: ok, setShiftActiveAction: ok, deleteShiftAction: ok,
  };
});

const { AttendanceScreen } = await import('./attendance-screen');
const { LeaveScreen } = await import('./leave-screen');
const { ShiftsScreen } = await import('./shifts-screen');

const EMP = { id: 'e1', name: 'Ramesh Kumar', employeeCode: 'BPP-014', role: 'WORKER' };

describe('AttendanceScreen — past day, person with no record', () => {
  const props = {
    records: [], unrecorded: [EMP], todayKey: '2026-10-13', date: '2026-10-05', summary: [], shifts: [],
    canWrite: true, view: 'daily', monthKey: '2026-10', timeZone: 'Asia/Kolkata',
  };

  it('offers Clock In (R2-165) and, once selected, Bulk Clock In / Bulk Clock Out (R2-166)', () => {
    render(<AttendanceScreen {...props} />);
    expect(screen.getAllByRole('button', { name: 'Clock In' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByRole('button', { name: 'Bulk Clock In' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bulk Clock Out' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark Absent' })).toBeTruthy();
  });

  // R2-244 (ALREADY_FIXED by R2-165, 48965ff): the unrecorded row's own Clock In opens the timed punch dialog on a past day.
  it('R2-244: Clock In on an unrecorded row for a past date opens the punch dialog asking for the time', () => {
    render(<AttendanceScreen {...props} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Clock In' })[0]);
    expect(screen.getByLabelText('Time (required for a past day)')).toBeTruthy();
  });
});

describe('LeaveScreen', () => {
  const base = { leaves: [], employees: [EMP], canApprove: true };
  const leave = (status: string, leaveType = 'CL') => ({ id: 'l1', date: '2026-10-14', status, leaveType, reason: null, employee: EMP });

  it('offers a Half-day leave type (R2-167)', () => {
    render(<LeaveScreen {...base} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Request Leave' }));
    expect(document.body.textContent).toContain('Half-day leave');
  });

  it('a pending half-day cannot be approved by a plain operator, but can be withdrawn (R2-167/168)', () => {
    render(<LeaveScreen {...base} leaves={[leave('PENDING', 'HALF_DAY')]} canDecideHalfDay={false} />);
    expect(screen.queryAllByRole('button', { name: 'Approve' })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Withdraw' }).length).toBeGreaterThan(0);
  });

  it('Owner/Admin see Approve on a pending half-day', () => {
    render(<LeaveScreen {...base} leaves={[leave('PENDING', 'HALF_DAY')]} canDecideHalfDay />);
    expect(screen.getAllByRole('button', { name: 'Approve' }).length).toBeGreaterThan(0);
  });

  it('Revoke on an approved leave is for the Owner only (R2-168)', () => {
    const { unmount } = render(<LeaveScreen {...base} leaves={[leave('APPROVED')]} />);
    expect(screen.queryAllByRole('button', { name: 'Revoke' })).toHaveLength(0);
    unmount();
    render(<LeaveScreen {...base} leaves={[leave('APPROVED')]} canRevoke />);
    expect(screen.getAllByRole('button', { name: 'Revoke' }).length).toBeGreaterThan(0);
  });
});

describe('ShiftsScreen (R2-170)', () => {
  it('has a Delete button per shift for writers only', () => {
    const shifts = [{ id: 's1', name: 'Trial', startTime: '09:00', endTime: '18:00', isDefault: false, isActive: true }];
    const { unmount } = render(<ShiftsScreen shifts={shifts} canWrite />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    unmount();
    render(<ShiftsScreen shifts={shifts} canWrite={false} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
