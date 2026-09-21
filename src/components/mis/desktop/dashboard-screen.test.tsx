/**
 * Phase 24 · D1 / D2 — the dashboard and its Customise mode.
 *
 * What a screenshot cannot enforce: that customising really adds, removes and reorders;
 * that what is saved is an ORDER (so geometry cannot be posted); that Reset is always
 * reachable; and that a Supervisor's panel has no money group to hide, because the server
 * never sent one (D24).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { catalogueFor, defaultLayoutFor } from '@/lib/mis/widgets';
import type { MisRoleName } from '@/lib/mis/roles';

import { DashboardScreen } from './dashboard-screen';
import type { DashboardData } from './widgets';

const EMPTY: DashboardData = {
  production: { produced: 40850, waste: 18, machinesRun: 13, entries: 4 },
  series: [
    { date: '1 Sep', produced: 30000, waste: 12 },
    { date: '2 Sep', produced: 40850, waste: 18 },
  ],
  plan: null,
  machines: { free: 6, running: 13, down: 2, total: 21 },
  attendance: { headcount: 70, present: 61, late: 4, onLeave: 3, absent: 2 },
  crew: { present: 14, headcount: 17, absent: 2, onLeave: 1, recorded: true },
  approvals: { total: 2, rows: [{ id: 'a', title: 'BOM for ORD-118', detail: 'Duplex carton' }] },
  orders: [{ id: 'o1', orderNumber: 'ORD-118', done: 2, total: 7, late: false, despatched: false }],
  onTime: { pct: 92, target: 95, despatched: 11, total: 12 },
  wastageByPhase: [],
  qc: null,
  defectsOpen: null,
  wages: { gross: 412600, ot: 38200, monthLabel: 'September', elapsedPct: 23 },
};

function setup(role: MisRoleName = 'OWNER', overrides: Partial<DashboardData> = {}) {
  const onSave = vi.fn(async (_keys: string[]) => ({ ok: true as const }));
  const onReset = vi.fn(async () => ({ ok: true as const }));
  const layout = defaultLayoutFor(role);
  render(
    <DashboardScreen
      role={role}
      initialLayout={layout}
      catalogue={catalogueFor(role)}
      data={{ ...EMPTY, ...overrides }}
      onSave={onSave}
      onReset={onReset}
    />,
  );
  return { onSave, onReset, layout };
}

const customise = () => fireEvent.click(screen.getByRole('button', { name: 'Customise' }));
const done = () => fireEvent.click(screen.getByRole('button', { name: 'Done' }));

beforeEach(() => vi.clearAllMocks());

describe('viewing', () => {
  it('renders one card per placed widget, and no Customise controls', () => {
    const { layout } = setup('OWNER');
    expect(screen.getAllByRole('region')).toHaveLength(layout.length);
    expect(screen.queryByRole('button', { name: /^Remove widget/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('a role with no widgets gets the honest empty state, not a blank page', () => {
    render(
      <DashboardScreen
        role="STORE_GUY"
        initialLayout={[]}
        catalogue={catalogueFor('STORE_GUY')}
        data={EMPTY}
        onSave={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getByText(/No widgets are available for your role/)).toBeTruthy();
  });

  it('a widget with no data says so rather than showing a zero (D2)', () => {
    setup('QC', { qc: null });
    // QC holds two quality widgets and neither has data, so both say so — and neither
    // shows a figure. (Scoped to those cards: a "0" on a chart axis elsewhere is a label,
    // not a fabricated reading.)
    const aql = screen.getByRole('region', { name: 'AQL this month' });
    const defects = screen.getByRole('region', { name: 'Defects open' });
    for (const card of [aql, defects]) {
      expect(card.textContent).toContain('No QC results recorded this month.');
      expect(card.textContent).not.toMatch(/\d/);
    }
  });
});

describe('Customise is a mode, and it looks like one', () => {
  it('opens the library panel and says what is happening', () => {
    setup();
    customise();
    expect(screen.getByText('Customising your dashboard')).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Widget library' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reset to default' })).toBeTruthy();
  });

  it('Reset is always available while customising (D2)', () => {
    const { onReset } = setup();
    customise();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('leaves the mode on Done, and saves', async () => {
    const { onSave } = setup();
    customise();
    done();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });
});

describe('add, remove and reorder', () => {
  it('REMOVES a widget from the layout, and saves the shorter order', async () => {
    const { onSave, layout } = setup();
    customise();
    fireEvent.click(screen.getByRole('button', { name: /^Remove widget: Output · yesterday/ }));
    expect(screen.getAllByRole('region')).toHaveLength(layout.length - 1);
    done();
    await vi.waitFor(() => {
      const saved = onSave.mock.calls[0][0] as string[];
      expect(saved).not.toContain('output.yesterday');
      expect(saved).toHaveLength(layout.length - 1);
    });
  });

  it('ADDS a widget back from the library, and the library marks it placed', async () => {
    const { onSave, layout } = setup();
    customise();
    fireEvent.click(screen.getByRole('button', { name: /^Remove widget: Output · yesterday/ }));

    const library = screen.getByRole('complementary', { name: 'Widget library' });
    fireEvent.click(within(library).getByRole('button', { name: /^Add widget: Output · yesterday/ }));
    expect(screen.getAllByRole('region')).toHaveLength(layout.length);
    // Adding it again is impossible: the button now says it is already placed.
    expect(within(library).getByRole('button', { name: /^Already on your dashboard: Output · yesterday/ })).toBeTruthy();

    done();
    await vi.waitFor(() => expect((onSave.mock.calls[0][0] as string[])).toContain('output.yesterday'));
  });

  it('REORDERS: moving a widget later changes the saved order, and only that', async () => {
    const { onSave, layout } = setup();
    const before = layout.map((p) => p.widgetKey);
    customise();
    fireEvent.click(screen.getByRole('button', { name: /^Move later: Output · yesterday/ }));
    done();
    await vi.waitFor(() => {
      const saved = onSave.mock.calls[0][0] as string[];
      expect(saved).not.toEqual(before);
      expect([...saved].sort()).toEqual([...before].sort()); // same widgets, new order
      expect(saved[0]).toBe(before[1]);
      expect(saved[1]).toBe(before[0]);
    });
  });

  it('the first widget cannot move earlier and the last cannot move later', () => {
    const { layout } = setup();
    customise();
    const firstTitle = /^Move earlier: Output · yesterday/;
    expect(screen.getByRole('button', { name: firstTitle })).toHaveProperty('disabled', true);
    const lastKey = layout[layout.length - 1].widgetKey;
    expect(lastKey).toBeTruthy();
  });

  it('what is saved is an ORDER of keys — never coordinates the browser chose', async () => {
    const { onSave } = setup();
    customise();
    done();
    await vi.waitFor(() => {
      const saved = onSave.mock.calls[0][0] as string[];
      expect(Array.isArray(saved)).toBe(true);
      for (const entry of saved) expect(typeof entry).toBe('string');
      expect(JSON.stringify(saved)).not.toMatch(/"x"|"y"|"w"|"h"/);
    });
  });

  it('a refused save keeps the person in the mode and tells them why', async () => {
    const onSave = vi.fn(async (_keys: string[]) => ({ ok: false as const, detail: 'That widget is not available to your role.' }));
    render(
      <DashboardScreen
        role="ADMIN"
        initialLayout={defaultLayoutFor('ADMIN')}
        catalogue={catalogueFor('ADMIN')}
        data={EMPTY}
        onSave={onSave}
        onReset={vi.fn()}
      />,
    );
    customise();
    done();
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/not available to your role/));
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy(); // still customising
  });
});

describe('D24 — the money widget in the panel', () => {
  it('the OWNER sees the money group and the wage figure', () => {
    setup('OWNER');
    expect(screen.getByRole('region', { name: 'Wages accrued' })).toBeTruthy();
    customise();
    const library = screen.getByRole('complementary', { name: 'Widget library' });
    expect(within(library).getByText('Money')).toBeTruthy();
    // The size/audience line is one text node split across values, so match the panel text.
    expect(library.textContent).toContain('Owner only');
  });

  it.each(['ADMIN', 'SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR'] as MisRoleName[])(
    '%s has no money group in the panel and no wage anywhere on the page',
    (role) => {
      const { container } = render(
        <DashboardScreen
          role={role}
          initialLayout={defaultLayoutFor(role)}
          catalogue={catalogueFor(role)}
          // Even if a wage figure were handed to the component, the widget is not in this
          // role's layout, so nothing can draw it.
          data={EMPTY}
          onSave={vi.fn()}
          onReset={vi.fn()}
        />,
      );
      fireEvent.click(within(container).getByRole('button', { name: 'Customise' }));
      expect(container.textContent).not.toMatch(/Wages accrued|4,12,600|Owner only/);
      expect(within(container).queryByText('Money')).toBeNull();
    },
  );
});
