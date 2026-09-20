import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { QueueSnapshot, QueuedItem } from '@/lib/mis/offline/queue';
import type { PunchResult } from '@/server/mis/attendance-punch';

const submit = vi.fn();
vi.mock('./submit-punch', () => ({ submitKioskPunch: (...a: unknown[]) => submit(...a) }));
const fix = vi.fn();
vi.mock('./punch-fix', () => ({ fixUnknownBadge: (...a: unknown[]) => fix(...a) }));
vi.mock('@/app/(mis)/mis/kiosk/actions', () => ({ submitPunchLiveAction: vi.fn(), replayPunchAction: vi.fn() }));

let snapshot: QueueSnapshot | null = null;
vi.mock('@/components/mis/shell/use-queue-snapshot', () => ({ useQueueSnapshot: () => snapshot }));

import { clearPunchSyncLog, recordPunchSent } from './punch-sync-log';
import { KioskScreen } from './kiosk-screen';

const IST = 'Asia/Kolkata';
const employees = [
  { id: 'e1', name: 'Ramesh Kumar', employeeCode: 'BPP-0142', role: 'WORKER', attendance: null },
  { id: 'e2', name: 'Suresh Patil', employeeCode: 'BPP-0150', role: 'WORKER', attendance: { id: 'a2', clockIn: new Date('2026-09-21T00:34:00Z'), clockOut: null, status: 'PRESENT' } },
];
const shifts = [{ id: 's1', name: 'Shift 1' }];

const props = (over: Record<string, unknown> = {}) => ({
  employees,
  shifts,
  date: '2026-09-21',
  userId: 'u1',
  timeZone: IST,
  loadedAt: new Date().toISOString(),
  ...over,
});

const item = (over: Partial<QueuedItem> = {}): QueuedItem => ({
  key: `k${Math.random()}`,
  kind: 'attendance.punch_in',
  payload: { badgeCode: 'BPP-0142' },
  clientRecordedAt: '2026-09-21T00:34:00.000Z',
  status: 'PENDING',
  attempts: 0,
  ...over,
});
const snap = (items: QueuedItem[]): QueueSnapshot => ({ items, pending: 0, failed: 0, lastSyncedAt: null, online: true });
const sentResult = (id: string, at = '2026-09-21T00:34:00.000Z'): PunchResult => ({
  punchId: id, employeeId: 'e1', employeeName: 'Ramesh Kumar', direction: 'IN', punchedAt: at, workDate: '2026-09-21', dayRebuilt: true, dayHeld: null,
});
const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

beforeEach(() => {
  vi.clearAllMocks();
  snapshot = null;
  setOnline(true);
  clearPunchSyncLog();
});
afterEach(cleanup);

describe('offline is a banner, never a block (K2)', () => {
  it('says how many punches are held, in words — and the scan list stays fully usable', () => {
    setOnline(false);
    snapshot = snap(Array.from({ length: 14 }, () => item()));
    render(<KioskScreen {...props()} />);

    expect(screen.getByText(/No signal · 14 punches held on this tablet/)).toBeTruthy();
    const search = screen.getByPlaceholderText(/Search by name/) as HTMLInputElement;
    expect(search.disabled).toBe(false);
    expect((screen.getByText('Ramesh Kumar').closest('button') as HTMLButtonElement).disabled).toBe(false);
  });

  it('“Carry on as normal” is shown in BOTH languages at once — nobody hunts for a switch (K2)', () => {
    setOnline(false);
    render(<KioskScreen {...props()} />);
    expect(screen.getByText('Carry on as normal')).toBeTruthy();
    expect(screen.getByText('Punches are saved on this tablet and sent automatically when signal returns.')).toBeTruthy();
    expect(screen.getByText('सिग्नल आने पर अपने आप भेज दिया जाएगा।')).toBeTruthy();
  });

  it('says the lists are as of their load time while offline, on the factory clock', () => {
    setOnline(false);
    render(<KioskScreen {...props({ loadedAt: '2026-09-21T00:34:00.000Z' })} />);
    expect(screen.getByText(/Offline — showing the lists as they were at/).textContent).toContain('06:04');
  });

  it('says the lists are old when the page is hours old, even though the browser claims to be online', async () => {
    render(<KioskScreen {...props({ loadedAt: new Date(Date.now() - 3 * 3_600_000).toISOString() })} />);
    await waitFor(() => expect(screen.getByText(/These lists are from/)).toBeTruthy());
  });

  it('says nothing about staleness for a fresh page', async () => {
    render(<KioskScreen {...props()} />);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.queryByText(/These lists are from/)).toBeNull();
  });
});

describe('the queue panel — K2’s “11 / 14 sent”', () => {
  const failedBadge = () => item({ status: 'PARKED', reason: 'BADGE_UNKNOWN', payload: { badgeCode: 'BPP-8841' }, clientRecordedAt: '2026-09-21T01:17:00.000Z' });

  function renderK2() {
    for (let i = 0; i < 11; i++) recordPunchSent(sentResult(`p${i}`, i === 0 ? '2026-09-21T00:34:00.000Z' : '2026-09-21T00:41:00.000Z'));
    snapshot = snap([failedBadge(), item({ attempts: 2, nextAttemptAt: Date.now() + 45_000 }), item()]);
    return render(<KioskScreen {...props()} />);
  }

  it('shows 11 / 14, the failed row and the waiting count', () => {
    renderK2();
    const panel = screen.getByRole('region');
    expect(within(panel).getByText('11')).toBeTruthy();
    expect(within(panel).getByText('/ 14')).toBeTruthy();
    expect(within(panel).getByText('sent')).toBeTruthy();
    expect(within(panel).getByText(/2 more waiting/)).toBeTruthy();
  });

  it('lists sent rows with their ORIGINAL punch time — 06:04 stays 06:04, however late it synced', () => {
    renderK2();
    expect(within(screen.getByRole('region')).getAllByText('06:04').length).toBeGreaterThan(0);
  });

  it('an unrecognised badge shows what happened and the scan time and code, with a Fix', () => {
    renderK2();
    const panel = screen.getByRole('region');
    expect(within(panel).getByText('Badge not recognised')).toBeTruthy();
    expect(within(panel).getByText(/06:47 · BPP-8841/)).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Fix' })).toBeTruthy();
  });

  it('backoff is visible: “retrying in 45s” — and never a nonsense number before the clock has been read', async () => {
    renderK2();
    expect(within(screen.getByRole('region')).queryByText(/retrying in/)).toBeNull(); // first paint: no clock yet
    await waitFor(() => expect(within(screen.getByRole('region')).getByText(/retrying in (4\d|45)s/)).toBeTruthy());
  });

  it('Fix asks who it really was, then records the correction for that person', async () => {
    fix.mockResolvedValue({ ok: true, key: 'new' });
    renderK2();
    fireEvent.click(within(screen.getByRole('region')).getByRole('button', { name: 'Fix' }));

    expect(screen.getByText('Who was this?')).toBeTruthy();
    fireEvent.click(await screen.findByText('Ramesh Kumar', { selector: 'span' }));

    await waitFor(() => expect(fix).toHaveBeenCalledTimes(1));
    expect(fix.mock.calls[0][0]).toMatchObject({ reason: 'BADGE_UNKNOWN' });
    expect(fix.mock.calls[0][1]).toEqual({ employeeCode: 'BPP-0142', name: 'Ramesh Kumar' });
    expect(await screen.findByText(/Recorded for Ramesh Kumar/)).toBeTruthy();
  });

  it('a failure only a person with authority can put right names who — and offers NO Fix', () => {
    snapshot = snap([item({ status: 'PARKED', reason: 'CORRECTION_WINDOW_CLOSED' })]);
    render(<KioskScreen {...props()} />);
    const panel = screen.getByRole('region');
    expect(within(panel).getByText('That day is closed for corrections')).toBeTruthy();
    expect(within(panel).getByText('A Super Attendance Operator has to decide this.')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: 'Fix' })).toBeNull();
  });

  it('“Back to scanning” clears the sent list but leaves what is still stuck', () => {
    renderK2();
    fireEvent.click(screen.getByRole('button', { name: 'Back to scanning' }));
    const panel = screen.getByRole('region');
    expect(within(panel).queryByText('11')).toBeNull();
    expect(within(panel).getByText('Badge not recognised')).toBeTruthy();
  });

  it('is absent entirely when there is nothing to show', () => {
    render(<KioskScreen {...props()} />);
    expect(screen.queryByRole('region')).toBeNull();
  });
});

describe('punching', () => {
  const pick = (name: string) => fireEvent.click(screen.getByText(name).closest('button') as HTMLButtonElement);

  it('sends the badge code, the shift and the signed-in user — and reports a live success', async () => {
    submit.mockResolvedValue({ kind: 'APPLIED', punchedAt: '2026-09-21T00:34:00.000Z' });
    render(<KioskScreen {...props()} />);

    pick('Ramesh Kumar');
    fireEvent.click(screen.getByRole('button', { name: /Clock in/ }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][0]).toMatchObject({ direction: 'IN', badgeCode: 'BPP-0142', shiftId: 's1', userId: 'u1' });
    expect(await screen.findByText(/Ramesh Kumar · in 06:04/)).toBeTruthy();
  });

  it('offline it is SAVED ON THIS DEVICE, in words that say what already happened — never “connection error”', async () => {
    submit.mockResolvedValue({ kind: 'QUEUED', punchedAt: '2026-09-21T00:34:00.000Z' });
    render(<KioskScreen {...props()} />);
    pick('Ramesh Kumar');
    fireEvent.click(screen.getByRole('button', { name: /Clock in/ }));
    const note = (await screen.findByText(/Saved on this device/)).textContent ?? '';
    expect(note).toMatch(/Saved on this device\. It will send when signal returns\./);
    expect(note).toMatch(/06:04/);
    expect(note).not.toMatch(/error/i);
  });

  it('after a punch the person shows as in, and the SAME direction is not offered again (K7)', async () => {
    submit.mockResolvedValue({ kind: 'QUEUED', punchedAt: '2026-09-21T00:34:00.000Z' });
    render(<KioskScreen {...props()} />);
    pick('Ramesh Kumar');
    fireEvent.click(screen.getByRole('button', { name: /Clock in/ }));
    await waitFor(() => expect(submit).toHaveBeenCalled());

    await within(screen.getByText('Ramesh Kumar').closest('button') as HTMLElement).findByText('in 06:04');
    pick('Ramesh Kumar');
    expect(screen.queryByRole('button', { name: /Clock in/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Clock out/ })).toBeTruthy();
  });

  it('a person already in offers Clock out only, with their in time read on the FACTORY clock', () => {
    render(<KioskScreen {...props()} />);
    pick('Suresh Patil');
    expect(screen.queryByRole('button', { name: /Clock in/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Clock out/ })).toBeTruthy();
    expect(screen.getAllByText('in 06:04').length).toBeGreaterThan(0);
  });

  it('reads the register in the FACTORY’s zone, not the browser’s (D22)', () => {
    render(<KioskScreen {...props({ timeZone: 'Asia/Singapore' })} />);
    expect(screen.getAllByText('in 08:34').length).toBeGreaterThan(0);
  });

  it('a live refusal is shown as-is and records nothing locally', async () => {
    submit.mockResolvedValue({ kind: 'BLOCKED', punchedAt: '2026-09-21T00:34:00.000Z', reason: 'CORRECTION_WINDOW_CLOSED', detail: '2026-09-17 is past the 3-day correction window.' });
    render(<KioskScreen {...props()} />);
    pick('Ramesh Kumar');
    fireEvent.click(screen.getByRole('button', { name: /Clock in/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/past the 3-day correction window/);
    expect(within(screen.getAllByText('Ramesh Kumar')[0].closest('button') as HTMLElement).getByText('—')).toBeTruthy();
  });

  it('NOT_SAVED is loud and keeps the person selected — the punch exists nowhere else', async () => {
    submit.mockResolvedValue({ kind: 'NOT_SAVED', detail: 'storage full' });
    render(<KioskScreen {...props()} />);
    pick('Ramesh Kumar');
    fireEvent.click(screen.getByRole('button', { name: /Clock in/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Not saved/);
    expect(screen.getByRole('button', { name: /Clock in/ })).toBeTruthy(); // still there to try again
  });
});
