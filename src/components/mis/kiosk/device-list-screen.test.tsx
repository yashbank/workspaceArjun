import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const approve = vi.fn();
const revoke = vi.fn();
const rename = vi.fn();
vi.mock('@/app/(mis)/mis/settings/devices/actions', () => ({
  approveEnrolmentAction: (...a: unknown[]) => approve(...a),
  revokeDeviceAction: (...a: unknown[]) => revoke(...a),
  renameDeviceAction: (...a: unknown[]) => rename(...a),
}));

import type { KioskDeviceRow } from '@/server/mis/kiosk-device';

import { DeviceListScreen } from './device-list-screen';

const ASOF = '2026-09-20T12:00:00.000Z';
const ago = (ms: number) => new Date(new Date(ASOF).getTime() - ms);

const gate1: KioskDeviceRow = {
  id: 'd1',
  name: 'GATE-01',
  status: 'ACTIVE',
  hardwareLabel: 'Samsung Tab A9 · Android 14',
  approvedAt: ago(86_400_000),
  revokedAt: null,
  revokedReason: null,
  lastSyncAt: ago(40_000),
  lastPullAt: ago(2 * 24 * 3_600_000),
  appVersion: '1.0.4',
  batteryPercent: 38,
  isCharging: false,
  queuedPunches: 14,
  syncLevel: 'GREEN',
  cacheLevel: 'AMBER',
};

const retired: KioskDeviceRow = {
  ...gate1,
  id: 'd2',
  name: 'GATE-OLD',
  status: 'REVOKED',
  revokedAt: ago(3_600_000),
  revokedReason: 'Left on a bus',
};

beforeEach(() => {
  vi.clearAllMocks();
  approve.mockResolvedValue({ ok: true, name: 'GATE-02' });
  revoke.mockResolvedValue({ ok: true });
  rename.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

const renderScreen = (devices: KioskDeviceRow[]) => render(<DeviceListScreen devices={devices} asOf={ASOF} />);

describe('the device list (K12, D19)', () => {
  it('says how old each thing is in plain words, measured from the server’s clock', () => {
    renderScreen([gate1]);
    expect(screen.getByText('Synced 40 seconds ago')).toBeTruthy();
    expect(screen.getByText('2 days old')).toBeTruthy();
    expect(screen.getByText('14 — none lost')).toBeTruthy();
    expect(screen.getByText('38% · not charging')).toBeTruthy();
    expect(screen.getByText('1.0.4')).toBeTruthy();
  });

  it('warns in a sentence when the battery is the real risk', () => {
    renderScreen([gate1]);
    expect(screen.getByRole('status').textContent).toMatch(/Not charging\. At 38% and no power, this tablet stops before the shift ends/);
  });

  it('labels a tablet that never synced, in words as well as colour', () => {
    renderScreen([{ ...gate1, lastSyncAt: null, lastPullAt: null, syncLevel: 'RED', cacheLevel: 'RED', batteryPercent: null, isCharging: null, queuedPunches: null, appVersion: null }]);
    expect(screen.getByText('Never synced')).toBeTruthy();
    expect(screen.getByText('never pulled')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows retired tablets separately, with the reason', () => {
    renderScreen([gate1, retired]);
    expect(screen.getByText('Retired', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText('Left on a bus')).toBeTruthy();
  });

  it('explains what a paired tablet does and does not receive', () => {
    renderScreen([]);
    expect(screen.getByText(/never receives wages, orders or customers/)).toBeTruthy();
    expect(screen.getByText('No tablet is paired yet')).toBeTruthy();
  });
});

describe('pairing (K10, D18)', () => {
  it('sends the typed code and the chosen name, then confirms', async () => {
    renderScreen([]);
    fireEvent.click(screen.getByRole('button', { name: /Pair a tablet/ }));
    fireEvent.change(screen.getByLabelText('Code on the tablet'), { target: { value: '4k7p-92' } });
    fireEvent.change(screen.getByLabelText('Name this tablet'), { target: { value: 'GATE-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pair tablet' }));

    await waitFor(() => expect(approve).toHaveBeenCalledWith('4K7P-92', 'GATE-02'));
    expect((await screen.findByRole('status')).textContent).toMatch(/GATE-02 is paired/);
  });

  it('shows the reason in words when the code has expired — not a generic failure', async () => {
    approve.mockResolvedValue({ ok: false, detail: 'That code is not valid or has expired. Ask for a new one on the tablet.' });
    renderScreen([]);
    fireEvent.click(screen.getByRole('button', { name: /Pair a tablet/ }));
    fireEvent.change(screen.getByLabelText('Code on the tablet'), { target: { value: 'ZZZZZ-99' } });
    fireEvent.change(screen.getByLabelText('Name this tablet'), { target: { value: 'GATE-03' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pair tablet' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/has expired/);
  });

  it('will not submit until both a code and a name are given', () => {
    renderScreen([]);
    fireEvent.click(screen.getByRole('button', { name: /Pair a tablet/ }));
    const submit = screen.getByRole('button', { name: 'Pair tablet' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Code on the tablet'), { target: { value: '4K7P-92' } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name this tablet'), { target: { value: 'GATE-01' } });
    expect(submit.disabled).toBe(false);
  });
});

describe('retiring (D18)', () => {
  it('says the queued punches are still counted, and sends the reason', async () => {
    renderScreen([gate1]);
    fireEvent.click(screen.getByRole('button', { name: /Retire…/ }));

    expect(screen.getByText(/still counted/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Why? (optional)'), { target: { value: 'Lost at the gate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retire this tablet' }));

    await waitFor(() => expect(revoke).toHaveBeenCalledWith('d1', 'Lost at the gate'));
  });

  it('keeps the panel open and says why when the server refuses', async () => {
    revoke.mockResolvedValue({ ok: false, detail: 'Only an Owner or Admin can manage gate tablets.' });
    renderScreen([gate1]);
    fireEvent.click(screen.getByRole('button', { name: /Retire…/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Retire this tablet' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Only an Owner or Admin/);
  });
});

describe('renaming', () => {
  it('starts from the current name and sends the new one', async () => {
    renderScreen([gate1]);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('New name') as HTMLInputElement;
    expect(input.value).toBe('GATE-01');
    fireEvent.change(input, { target: { value: 'GATE-EAST' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => expect(rename).toHaveBeenCalledWith('d1', 'GATE-EAST'));
  });
});
