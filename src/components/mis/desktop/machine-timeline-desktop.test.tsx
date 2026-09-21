/**
 * Phase 24C · D5 — the machine day timeline screen, built from D5's own picture.
 *
 * What a screenshot cannot enforce: that free time draws NOTHING, that running, booked and
 * finished are three different fills, that downtime is hatched, that the toggle exists only on
 * the desktop view, and that the panel never invents the downtime facts nobody recorded.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildMachineTimeline, type AllocationInput, type MachineInput } from '@/lib/mis/machine-timeline';
import type { MachineDayTimeline } from '@/server/mis/machines-board';

import { MachineTimelineDesktop } from './machine-timeline-desktop';

const IST = 'Asia/Kolkata';
const ist = (hh: number, mm = 0, day = 7) => new Date(Date.UTC(2026, 8, day, hh, mm) - 5.5 * 3_600_000);
const machine = (id: string, name: string, isActive = true): MachineInput => ({ id, name, code: id, machineType: 'Press', department: 'Printing', isActive });
const alloc = (machineId: string, from: number, fromM: number, to: number, toM: number, order: string, phase: string | null = null): AllocationInput => ({
  machineId, startsAt: ist(from, fromM), endsAt: ist(to, toM), orderNumber: order, processName: phase,
});

const MACHINES = [
  machine('heid', 'Heidelberg SM 74'), machine('polar', 'Polar 115 Cutter'), machine('lam', 'Lamination 1'),
  machine('plat2', 'Auto Platen 2', false), machine('glue', 'Folder Gluer 1'), machine('uv', 'UV Coater'),
  machine('ruling', 'Ruling Machine 2', false), machine('screen', 'Screen Printer'), machine('plat1', 'Auto Platen 1'),
];
const ALLOCS = [
  alloc('heid', 6, 0, 13, 0, 'ORD-118', 'Printing'),
  alloc('polar', 10, 0, 13, 0, 'ORD-117'),
  alloc('lam', 6, 0, 11, 30, 'ORD-114', 'Lamination'),
  alloc('lam', 11, 30, 15, 0, 'ORD-118'),
  alloc('glue', 6, 0, 10, 0, 'ORD-109', 'Pasting'),
  alloc('uv', 6, 0, 12, 15, 'ORD-109', 'Coating'),
  alloc('screen', 12, 0, 14, 0, 'ORD-121'),
];

function data(now = ist(7, 12), allocs = ALLOCS): MachineDayTimeline {
  return {
    shift: { name: 'Shift 1', dateKey: '2026-09-07', startMinute: 360, endMinute: 900 },
    timeline: buildMachineTimeline(MACHINES, allocs, { startMinute: 360, endMinute: 900, dateKey: '2026-09-07', timeZone: IST }, now),
  };
}

const GRID = <p>the existing card grid</p>;
const renderScreen = (d: MachineDayTimeline | null = data()) =>
  render(<MachineTimelineDesktop data={d} gridView={GRID} todayLabel="07/09" />);

describe('the header', () => {
  it('summarises the shop the way D5 does: counts and the shift', () => {
    renderScreen();
    expect(screen.getByText(/9 machines · 4 running · 3 free · 2 down · Shift 1, 06:00 – 15:00/)).toBeTruthy();
  });

  it('carries today\'s date', () => {
    renderScreen();
    expect(screen.getByText('07/09')).toBeTruthy();
  });
});

describe('the Grid | Day timeline toggle', () => {
  it('defaults to the timeline and offers both views', () => {
    renderScreen();
    const group = screen.getByRole('group', { name: 'Machine board view' });
    expect(within(group).getByRole('button', { name: 'Day timeline' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(group).getByRole('button', { name: 'Grid' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('switching to Grid shows the existing card grid and hides the timeline', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    expect(screen.getByText('the existing card grid')).toBeTruthy();
    expect(screen.queryByText(/machines shown/)).toBeNull();
  });

  it('switching back restores the timeline', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Grid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Day timeline' }));
    expect(screen.getByText(/machines shown/)).toBeTruthy();
  });

  it('with no shift configured there is NO toggle — absent, not disabled — and the grid is what shows', () => {
    const { container } = renderScreen(null);
    expect(screen.queryByRole('group', { name: 'Machine board view' })).toBeNull();
    expect(container.querySelectorAll('[disabled],[aria-disabled="true"]')).toHaveLength(0);
    expect(screen.getByText('the existing card grid')).toBeTruthy();
    expect(screen.getByText(/No shift is set up/)).toBeTruthy();
  });
});

describe('the timeline — free time is a gap, not a colour', () => {
  it('shows 8 of 9 machines: the one with nothing booked has no row at all', () => {
    renderScreen();
    expect(screen.getByText(/8 of 9 machines shown/)).toBeTruthy();
    const tracks = screen.getAllByRole('img').map((el) => el.getAttribute('aria-label') ?? '');
    expect(tracks.some((l) => l.startsWith('Auto Platen 1'))).toBe(false);
    expect(tracks.filter((l) => l.startsWith('Heidelberg')).length).toBe(1);
  });

  it('paints no bar for idle time: the only bar kinds are running, booked, finished and down', () => {
    const { container } = renderScreen();
    const kinds = new Set([...container.querySelectorAll('[data-kind]')].map((el) => el.getAttribute('data-kind')));
    expect([...kinds].sort()).toEqual(['BOOKED', 'DOWN', 'RUNNING']);
  });

  it('never colours a bar green — green is reserved for state', () => {
    const { container } = renderScreen();
    for (const bar of container.querySelectorAll<HTMLElement>('[data-kind]')) {
      expect(bar.style.backgroundColor).not.toMatch(/22, ?163, ?74|#16a34a/i);
    }
  });

  it('running is solid, booked is pale, finished is grey — three different fills', () => {
    const { container } = renderScreen(data(ist(11, 0)));
    const fill = (kind: string) => container.querySelector<HTMLElement>(`[data-kind="${kind}"]`)!.style.backgroundColor;
    expect(new Set([fill('RUNNING'), fill('BOOKED'), fill('FINISHED')]).size).toBe(3);
  });

  it('downtime is HATCHED, not merely red — it survives greyscale and colour-blindness', () => {
    const { container } = renderScreen();
    const down = container.querySelector<HTMLElement>('[data-kind="DOWN"]')!;
    expect(down.style.backgroundImage).toContain('repeating-linear-gradient');
    expect(down.style.backgroundImage).toContain('45deg');
  });

  it('a down machine gets a full-width bar labelled honestly — no invented "since 05:40"', () => {
    const { container } = renderScreen();
    const downBars = container.querySelectorAll('[data-kind="DOWN"]');
    expect(downBars).toHaveLength(2);
    for (const bar of downBars) {
      expect(bar.textContent).toBe('Down · switched off');
      expect(bar.textContent).not.toMatch(/since|\d\d:\d\d/);
    }
  });

  it('labels bookings with what D5 shows: order and phase when running, "booked HH:MM" when promised', () => {
    const { container } = renderScreen();
    const text = (kind: string) => [...container.querySelectorAll(`[data-kind="${kind}"]`)].map((b) => b.textContent);
    expect(text('RUNNING')).toContain('ORD-118 · Printing');
    expect(text('BOOKED')).toContain('ORD-117 · booked 10:00');
  });

  it('positions bars by time: Polar 10:00–13:00 starts 44% across a 06:00–15:00 window and is 33% wide', () => {
    const { container } = renderScreen();
    const polar = [...container.querySelectorAll<HTMLElement>('[data-kind="BOOKED"]')].find((b) => b.textContent?.includes('ORD-117'))!;
    expect(parseFloat(polar.style.left)).toBeCloseTo(44.44, 1);
    expect(parseFloat(polar.style.width)).toBeCloseTo(33.33, 1);
  });

  it('draws the hour header 06 to 14 — nine columns', () => {
    renderScreen();
    for (const h of ['06', '07', '08', '09', '10', '11', '12', '13', '14']) expect(screen.getAllByText(h).length).toBeGreaterThan(0);
  });

  it('marks "now" and says when; outside the shift there is no marker', () => {
    const { unmount } = renderScreen();
    expect(screen.getByText(/Now · 07:12/)).toBeTruthy();
    unmount();
    renderScreen(data(ist(17, 0)));
    expect(screen.queryByText(/Now ·/)).toBeNull();
  });

  it('the legend names every fill', () => {
    renderScreen();
    for (const l of ['Running now', 'Booked, not started', 'Past booking', 'Down']) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
  });
});

describe('an empty board — and saying the TRUE thing about it', () => {
  // Found by the checker: with nothing booked and nothing down, the card used to say "Every
  // machine is booked or down" — the opposite of the truth, borrowed from the Free-now card.
  const quiet = () => data(ist(7, 12), []);
  const onlyFree = () => ({
    shift: quiet().shift,
    timeline: buildMachineTimeline(MACHINES.filter((m) => m.isActive), [], { startMinute: 360, endMinute: 900, dateKey: '2026-09-07', timeZone: IST }, ist(7, 12)),
  });

  it('with no bookings and nothing down the timeline says every machine is FREE', () => {
    renderScreen(onlyFree());
    expect(screen.getByText('Nothing is booked this shift — every machine is free.')).toBeTruthy();
  });

  it('...and does NOT say the machines are booked or down anywhere in the timeline card', () => {
    renderScreen(onlyFree());
    const card = screen.getByText(/Shift 1 · 06:00 – 15:00/).closest('section')!;
    expect(card.textContent).not.toMatch(/booked or down/);
  });

  it('the Free-now card is where "booked or down" belongs — when nothing at all is free', () => {
    renderScreen(data(ist(7, 12), [...ALLOCS, alloc('plat1', 6, 0, 15, 0, 'ORD-9', 'X'), alloc('polar', 6, 0, 10, 0, 'ORD-8'), alloc('screen', 6, 0, 12, 0, 'ORD-7')]));
    const card = screen.getByRole('heading', { name: 'Free right now' }).closest('section')!;
    expect(within(card).getByText('Every machine is booked or down.')).toBeTruthy();
  });

  it('a past booking is labelled as time having passed, not as a finished job the data cannot know', () => {
    renderScreen();
    expect(screen.queryByText('Finished')).toBeNull();
    expect(screen.getAllByText('Past booking').length).toBeGreaterThan(0);
  });
});

describe('the panel answers the next question', () => {
  it('opens on the down machine by default — the one that needs attention', () => {
    renderScreen();
    const panel = screen.getAllByRole('heading', { level: 2 }).find((h) => h.textContent === 'Auto Platen 2');
    expect(panel).toBeTruthy();
    expect(screen.getByText('Switched off')).toBeTruthy();
  });

  it('for a down machine it says what is NOT recorded and offers NO action — no invented reason, no button that cannot work', () => {
    renderScreen();
    expect(screen.getByText(/not recorded yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /back in service/i })).toBeNull();
    expect(screen.queryByText(/Reported by|Reason|Gripper/i)).toBeNull();
  });

  it('selecting a running machine shows its bookings and utilisation instead', () => {
    renderScreen();
    const row = screen.getAllByRole('button', { name: /Lamination 1/ })[0];
    fireEvent.click(row);
    expect(screen.getByText('Bookings this shift')).toBeTruthy();
    expect(screen.getByText('06:00–11:30')).toBeTruthy();
    expect(screen.getByText('11:30–15:00')).toBeTruthy();
    expect(screen.queryByText('Switched off')).toBeNull();
  });

  it('marks the selected row for assistive tech', () => {
    renderScreen();
    const pressed = screen.getAllByRole('button', { pressed: true }).map((b) => b.textContent);
    expect(pressed.some((t) => t?.includes('Auto Platen 2'))).toBe(true);
  });

  it('"Free right now" is D5\'s own list, each with when it frees up', () => {
    renderScreen();
    const card = screen.getByRole('heading', { name: 'Free right now' }).closest('section')!;
    expect(within(card).getByText('free to 10:00')).toBeTruthy();
    expect(within(card).getByText('free to 12:00')).toBeTruthy();
    expect(within(card).getByText('free all shift')).toBeTruthy();
    expect(within(card).getByText('Polar 115 Cutter')).toBeTruthy();
  });

  it('when nothing is free it says so', () => {
    renderScreen(data(ist(7, 12), [...ALLOCS, alloc('plat1', 6, 0, 15, 0, 'ORD-9', 'X'), alloc('polar', 6, 0, 10, 0, 'ORD-8'), alloc('screen', 6, 0, 12, 0, 'ORD-7')]));
    const card = screen.getByRole('heading', { name: 'Free right now' }).closest('section')!;
    expect(within(card).getByText('Every machine is booked or down.')).toBeTruthy();
  });
});

describe('utilisation — one scale, one axis', () => {
  it('shows each machine\'s share of the shift, and marks the down ones "down", not 0% idle', () => {
    renderScreen();
    const card = screen.getByRole('heading', { name: 'Utilisation this week' }).closest('section')!;
    expect(within(card).getByText('78%')).toBeTruthy(); // Heidelberg 7h of 9h
    expect(within(card).getAllByText('down').length).toBe(2);
  });

  it('says it is booked, not actually run', () => {
    renderScreen();
    expect(screen.getByText('Booked, not actually run.')).toBeTruthy();
  });

  it('bar heights share ONE scale: the 78% bar is taller than the 22% bar in exact proportion', () => {
    renderScreen();
    const list = screen.getByRole('list', { name: 'Utilisation this week' });
    const height = (pct: string) => {
      const li = within(list).getByText(pct).closest('li')!;
      return parseFloat((li.querySelector('span[style*="height"]') as HTMLElement).style.height);
    };
    expect(height('78%') / height('22%')).toBeCloseTo(78 / 22, 1); // Heidelberg 7h of 9h vs Screen Printer 2h of 9h
  });
});

describe('two layouts (D1/D3/D5) — the timeline and its toggle are absent below 1024px', () => {
  const page = readFileSync(path.join(process.cwd(), 'src/app/(mis)/mis/machine-board/page.tsx'), 'utf8');

  it('the phone grid is shown below 1024px and the desktop view (with the toggle) only from there up', () => {
    expect(page).toContain('className="lg:hidden"');
    expect(page).toContain('className="hidden lg:block"');
  });

  it('the toggle lives INSIDE the desktop-only component, so a phone can never render it', () => {
    // The page holds no toggle markup of its own — the buttons are in the client component.
    expect(page).not.toContain('aria-pressed');
    expect(page).not.toContain('<button');
    const src = readFileSync(path.join(process.cwd(), 'src/components/mis/desktop/machine-timeline-desktop.tsx'), 'utf8');
    expect(src).toContain("t('d5.dayTimeline')");
  });

  it('uses only the lg breakpoint — no sm/md/xl/2xl anywhere in the desktop tree or the page', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/components/mis/desktop/machine-timeline-desktop.tsx'), 'utf8');
    expect(src).not.toMatch(/['" ](sm|md|xl|2xl):/);
    expect(page).not.toMatch(/\b(sm|md|xl|2xl):(hidden|block)\b/);
  });
});
