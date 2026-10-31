/** R2-240 — my own approved leave can be cancelled while it has not started; a started one cannot, from here. */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const cancelLeaveRequestAction = vi.fn(async () => ({ ok: true, value: undefined }));
vi.mock('@/app/(mis)/mis/attendance/actions', () => ({
  requestLeaveAction: vi.fn(), cancelLeaveRequestAction: (...a: unknown[]) => cancelLeaveRequestAction(...(a as [])),
}));

const { MyLeaveScreen } = await import('./my-leave-screen');

const row = (over: Partial<{ id: string; date: string; status: string }>) =>
  ({ id: 'l1', date: '2026-10-20T00:00:00.000Z', endDate: null, leaveType: 'CL', status: 'APPROVED', reason: null, ...over });

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-13T06:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('MyLeaveScreen', () => {
  it('offers Cancel on an approved leave that starts later, asks for a reason, then calls the action with it', () => {
    render(<MyLeaveScreen employeeId="e1" leaves={[row({})]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    const go = screen.getByRole('button', { name: 'Cancel this leave' }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'trip cancelled' } });
    fireEvent.click(go);
    expect(cancelLeaveRequestAction).toHaveBeenCalledWith('l1', 'trip cancelled');
  });

  it('no Cancel on an approved leave that already started, nor on a rejected one; Withdraw stays for PENDING', () => {
    render(<MyLeaveScreen employeeId="e1" leaves={[row({ id: 'a', date: '2026-10-12T00:00:00.000Z' }), row({ id: 'b', status: 'REJECTED' }), row({ id: 'c', status: 'PENDING' })]} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeTruthy();
  });
});
