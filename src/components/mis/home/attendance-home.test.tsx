import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { KioskCardData } from '@/lib/mis/kiosk-health';

import { AttendanceHome, type AttendanceHomeProps } from './attendance-home';

const base = (health: KioskCardData): AttendanceHomeProps => ({
  header: { title: 'Attendance', meta: 'Monday, 7 September · 08:05' },
  isSuper: false,
  kiosk: { lastPunch: '2 minutes ago', punchesToday: 61, health },
  today: { present: 61, headcount: 70, late: 4, onLeave: 3, absent: 2, recorded: true },
  forgotClockOut: { label: 'on Sun 6 Sep', people: [] },
  lateArrivals: [],
  corrections: null,
});

const dev = (o: Partial<KioskCardData['devices'][number]> = {}) => ({
  id: 'd1',
  name: 'GATE-01',
  level: 'GREEN' as const,
  syncedAgo: '40 seconds',
  queued: 'nothing queued',
  batteryWarning: null,
  ...o,
});

afterEach(cleanup);

describe('the gate-kiosk health card (R5: "kiosk health is the top card")', () => {
  it('green: "Gate kiosk online — Synced 40 seconds ago · nothing queued"', () => {
    render(<AttendanceHome {...base({ level: 'GREEN', devices: [dev()] })} />);
    expect(screen.getByText('Gate kiosk online')).toBeTruthy();
    expect(screen.getByText('Synced 40 seconds ago · nothing queued')).toBeTruthy();
  });

  it('amber and red change the WORDS, not just the colour', () => {
    const { rerender } = render(
      <AttendanceHome {...base({ level: 'AMBER', devices: [dev({ level: 'AMBER', syncedAgo: '3 h 12 m', queued: '14 punches queued' })] })} />,
    );
    expect(screen.getByText('Gate kiosk quiet')).toBeTruthy();
    expect(screen.getByText('Synced 3 h 12 m ago · 14 punches queued')).toBeTruthy();

    rerender(<AttendanceHome {...base({ level: 'RED', devices: [dev({ level: 'RED', syncedAgo: 'never' })] })} />);
    expect(screen.getByText('Gate kiosk not syncing')).toBeTruthy();
    expect(screen.getByText(/Never synced/)).toBeTruthy();
  });

  it('names each tablet when there are several, and lets the worst decide the card', () => {
    render(
      <AttendanceHome
        {...base({
          level: 'RED',
          devices: [dev(), dev({ id: 'd2', name: 'GATE-02', level: 'RED', syncedAgo: '9 h' })],
        })}
      />,
    );
    expect(screen.getByText('Gate kiosk not syncing')).toBeTruthy();
    expect(screen.getByText(/GATE-02/)).toBeTruthy();
    expect(screen.getByText(/GATE-01/)).toBeTruthy();
  });

  it('prints the battery sentence when that is the real risk (K12)', () => {
    render(<AttendanceHome {...base({ level: 'AMBER', devices: [dev({ level: 'AMBER', batteryWarning: 'Not charging at 38%. Plug it in.' })] })} />);
    expect(screen.getByText('Not charging at 38%. Plug it in.')).toBeTruthy();
  });

  it('says so — and points at Settings — when no tablet is paired, rather than pretending it is online', () => {
    render(<AttendanceHome {...base({ level: null, devices: [] })} />);
    expect(screen.getByText('No gate tablet is paired')).toBeTruthy();
    expect(screen.queryByText('Gate kiosk online')).toBeNull();
  });
});
