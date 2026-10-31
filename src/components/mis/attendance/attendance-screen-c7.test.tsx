/** R2-369/370/371/373 — Clock Out pre-fills from the shift (only when empty, still editable) and a one-tap standard shift on a past day. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
const bulkPunchAction = vi.fn(async () => ({ ok: true, value: { skipped: [] } }));
const editAttendanceAction = vi.fn(async () => ({ ok: true, value: undefined }));
vi.mock('@/app/(mis)/mis/attendance/actions', () => {
  const ok = async () => ({ ok: true, value: { skipped: [], skippedDates: [] } });
  return {
    clockInAction: ok, clockOutAction: ok, approveClockOutAction: ok, markAbsentBulkAction: ok, listPunchesForDayAction: ok, addAttendanceNoteAction: ok,
    editAttendanceAction: (...a: unknown[]) => editAttendanceAction(...(a as [])),
    bulkPunchAction: (...a: unknown[]) => bulkPunchAction(...(a as [])),
  };
});

const { AttendanceScreen } = await import('./attendance-screen');

const EMP = { id: 'e1', name: 'Ramesh Kumar', employeeCode: 'BPP-014', role: 'WORKER' };
const DAY = { id: 's1', name: 'Morning', startTime: '06:00', endTime: '15:00' };
const NIGHT = { id: 's2', name: 'Night', startTime: '22:00', endTime: '06:00' };
// 06:00 IST on 2026-10-05 = 00:30Z
const rec = (over: Record<string, unknown> = {}) => ({
  id: 'a1', date: new Date('2026-10-05T00:00:00Z'), status: 'PRESENT', clockIn: new Date('2026-10-05T00:30:00Z'), clockOut: null,
  approvedOut: false, lateMinutes: 0, otMinutes: 0, notes: null, employee: EMP, shift: DAY, ...over,
});
const base = { unrecorded: [], todayKey: '2026-10-13', date: '2026-10-05', summary: [], shifts: [DAY, NIGHT], canWrite: true, view: 'daily', monthKey: '2026-10', timeZone: 'Asia/Kolkata' };
const out = () => screen.getByLabelText('Clock Out') as HTMLInputElement;
const inp = () => screen.getByLabelText('Clock In') as HTMLInputElement;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const editButton = () => screen.getAllByRole('button', { name: 'Edit' })[0]; // the row renders a phone and a desktop button

describe('R2-369 / R2-370 the Edit dialog', () => {
  it('an empty Clock Out is pre-filled with the shift end, and follows Clock In + shift length until typed', () => {
    render(<AttendanceScreen {...base} records={[rec()]} />);
    fireEvent.click(editButton());
    expect(inp().value).toBe('06:00');
    expect(out().value).toBe('15:00'); // R2-369
    fireEvent.change(inp(), { target: { value: '06:15' } });
    expect(out().value).toBe('15:15'); // R2-370
    fireEvent.change(out(), { target: { value: '14:30' } }); // typed: now it is the person's
    fireEvent.change(inp(), { target: { value: '07:00' } });
    expect(out().value).toBe('14:30');
  });
  it('a recorded Clock Out is never overwritten', () => {
    render(<AttendanceScreen {...base} records={[rec({ clockOut: new Date('2026-10-05T09:00:00Z') })]} />);
    fireEvent.click(editButton());
    expect(out().value).toBe('14:30');
    fireEvent.change(inp(), { target: { value: '07:00' } });
    expect(out().value).toBe('14:30');
  });
  it('a night shift wraps past midnight: 22:30 in -> 06:30 out (R2-372)', () => {
    render(<AttendanceScreen {...base} records={[rec({ shift: NIGHT, clockIn: new Date('2026-10-05T17:00:00Z') /* 22:30 IST */ })]} />);
    fireEvent.click(editButton());
    expect(inp().value).toBe('22:30');
    expect(out().value).toBe('06:30');
  });
});

describe('R2-371 Bulk Clock Out', () => {
  it('the Time defaults to the selected shift end and changes with the shift, but a typed time stays', () => {
    render(<AttendanceScreen {...base} records={[rec()]} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Bulk Clock Out' }));
    const time = screen.getByLabelText('Time (required for a past day)') as HTMLInputElement;
    expect(time.value).toBe('15:00'); // the person's clock-in shift, Morning
    fireEvent.change(screen.getByLabelText('Shift'), { target: { value: 's2' } });
    expect(time.value).toBe('06:00');
    fireEvent.change(time, { target: { value: '05:40' } });
    fireEvent.change(screen.getByLabelText('Shift'), { target: { value: 's1' } });
    expect(time.value).toBe('05:40');
  });
});

describe('R2-373 standard shift on a past day', () => {
  it('one tap records Clock In at the shift start and Clock Out at its end for the selected people', async () => {
    render(<AttendanceScreen {...base} records={[]} unrecorded={[EMP]} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Clock In' })[0]);
    expect(screen.queryByRole('button', { name: /Standard shift/ })).toBeNull(); // no shift picked yet
    fireEvent.change(screen.getByLabelText('Shift'), { target: { value: 's1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Standard shift (06:00 – 15:00): clock in and out' }));
    await waitFor(() => expect(bulkPunchAction).toHaveBeenCalledTimes(2));
    expect(bulkPunchAction.mock.calls[0]).toEqual(['IN', ['e1'], { date: '2026-10-05', time: '06:00', shiftId: null }]);
    expect(bulkPunchAction.mock.calls[1]).toEqual(['OUT', ['e1'], { date: '2026-10-05', time: '15:00', shiftId: 's1' }]);
  });
});
