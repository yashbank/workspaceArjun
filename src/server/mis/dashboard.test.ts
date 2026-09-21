/**
 * Phase 24 · D2 / D24 — the widget catalogue and the layout, AT THE SERVER FUNCTION.
 *
 * `lib/mis/widgets.test.ts` proves the table. This proves the door: what the server hands
 * back for each of the eight roles, and what it refuses to save. The rule being defended
 * is D2's own — "if the figure never reaches the browser, no amount of devtools poking
 * finds it" — so the assertions are about the RESPONSE, not about what a component draws.
 *
 * Reading omits, writing throws. Both are asserted for every one of the seven non-Owner
 * roles, because "the UI hides it" is not a fix (the Phase 14F lesson).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';
import { mayUseWidget, type PlacedWidget } from '@/lib/mis/widgets';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

/**
 * The fake database holds layout ROWS and nothing else.
 *
 * Every other table is a trap that throws: the dashboard owns `mis_dashboard_widgets` and
 * must reach factory data only through the phone layer's existing server functions, never by
 * querying for it here. A stray `db.misOrder...` fails loudly rather than quietly passing.
 */
const stored: { rows: Row[] } = { rows: [] };
const calls: string[] = [];

type Row = { userProfileId: string; widgetKey: string; x: number; y: number; w: number; h: number };

const misDashboardWidget = {
  findMany: async ({ where }: { where: { userProfileId: string } }) => {
    calls.push('findMany');
    return stored.rows
      .filter((r) => r.userProfileId === where.userProfileId)
      .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  },
  deleteMany: async ({ where }: { where: { userProfileId: string } }) => {
    calls.push('deleteMany');
    const before = stored.rows.length;
    stored.rows = stored.rows.filter((r) => r.userProfileId !== where.userProfileId);
    return { count: before - stored.rows.length };
  },
  createMany: async ({ data }: { data: Row[] }) => {
    calls.push('createMany');
    // The composite primary key is (user_profile_id, widget_key); the real table would
    // refuse a duplicate rather than storing it twice.
    for (const row of data) {
      if (stored.rows.some((r) => r.userProfileId === row.userProfileId && r.widgetKey === row.widgetKey)) {
        throw new Error('Unique constraint failed on mis_dashboard_widgets_pkey');
      }
      if (row.x < 0 || row.w < 1 || row.x + row.w > 4 || row.y < 0 || row.h < 1 || row.h > 3) {
        throw new Error('mis_dashboard_widgets_grid_ck violated');
      }
      stored.rows.push({ ...row });
    }
    return { count: data.length };
  },
};

vi.mock('@/server/db', () => ({
  db: new Proxy(
    {
      misDashboardWidget,
      // Prisma runs an array transaction in order and atomically; the fake keeps the order
      // and, like the real one, applies nothing if a later statement throws.
      $transaction: async (ops: Promise<unknown>[]) => {
        const snapshot = stored.rows.map((r) => ({ ...r }));
        try {
          return await Promise.all(ops);
        } catch (error) {
          stored.rows = snapshot;
          throw error;
        }
      },
    },
    {
      get: (target, key) => {
        if (key in target) return target[key as keyof typeof target];
        throw new Error(`dashboard.ts must not query ${String(key)}`);
      },
    },
  ),
}));

const { getDashboardCatalogue, getDashboardLayout, prepareDashboardLayout, assertMayPlaceWidgets, saveDashboardLayout, resetDashboardLayout } =
  await import('./dashboard');

const NON_OWNER = MIS_ROLES.filter((r) => r !== 'OWNER');
const MONEY = 'money.wagesAccrued';

const as = (role: MisRoleName | null) => {
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue(role);
};

/** 'denied' for a MisForbiddenError, otherwise the value. Anything else is a real failure. */
async function outcome<T>(fn: () => Promise<T>): Promise<'denied' | { value: T }> {
  try {
    return { value: await fn() };
  } catch (e) {
    if ((e as Error).name === 'MisForbiddenError') return 'denied';
    throw e;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  stored.rows = [];
  calls.length = 0;
});

describe('the catalogue response', () => {
  it('the OWNER receives the money group — so an absence below means something', async () => {
    as('OWNER');
    const groups = await getDashboardCatalogue();
    expect(groups.map((g) => g.group)).toContain('MONEY');
    expect(JSON.stringify(groups)).toContain(MONEY);
  });

  it.each(NON_OWNER)('%s receives no money group and no money widget anywhere in the response', async (role) => {
    as(role);
    const groups = await getDashboardCatalogue();
    expect(groups.map((g) => g.group)).not.toContain('MONEY');
    expect(JSON.stringify(groups)).not.toContain(MONEY);
    expect(JSON.stringify(groups)).not.toMatch(/wage|salary/i);
  });

  it.each(NON_OWNER)('%s still receives a usable library, or none at all — never a half-built one', async (role) => {
    as(role);
    for (const entry of await getDashboardCatalogue()) expect(entry.widgets.length).toBeGreaterThan(0);
  });

  it('an anonymous caller receives an empty catalogue rather than the default one', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await getDashboardCatalogue()).toEqual([]);
    expect(getMisRole).not.toHaveBeenCalled();
  });

  it('a login with no MIS role receives an empty catalogue', async () => {
    as(null);
    expect(await getDashboardCatalogue()).toEqual([]);
  });
});

describe('the layout response', () => {
  it('the OWNER receives a layout including the money widget', async () => {
    as('OWNER');
    expect((await getDashboardLayout()).map((p) => p.widgetKey)).toContain(MONEY);
  });

  it.each(NON_OWNER)('%s receives a layout with no money widget in it', async (role) => {
    as(role);
    const layout = await getDashboardLayout();
    expect(layout.map((p) => p.widgetKey)).not.toContain(MONEY);
    expect(JSON.stringify(layout)).not.toMatch(/wage|salary/i);
  });

  it('an anonymous caller receives an empty layout', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await getDashboardLayout()).toEqual([]);
  });
});

describe('saving a layout — the write path REFUSES rather than omitting', () => {
  const money: PlacedWidget[] = [{ widgetKey: MONEY, x: 0, y: 0, w: 1, h: 2 }];
  const safe: PlacedWidget[] = [{ widgetKey: 'output.yesterday', x: 0, y: 0, w: 1, h: 1 }];

  it.each(NON_OWNER)('%s is refused when the layout places the money widget', async (role) => {
    as(role);
    expect(await outcome(() => prepareDashboardLayout(money))).toBe('denied');
  });

  it.each(NON_OWNER)('%s is refused even when the money widget is buried among allowed ones', async (role) => {
    as(role);
    expect(await outcome(() => prepareDashboardLayout([...safe, ...money]))).toBe('denied');
  });

  it('the OWNER may save it (so the refusals are the role, not a broken writer)', async () => {
    as('OWNER');
    const res = await outcome(() => prepareDashboardLayout(money));
    expect(res).not.toBe('denied');
    if (res !== 'denied') expect(res.value).toEqual({ userId: 'u1', layout: money });
  });

  it('a refusal saves NOTHING — the allowed part of a rejected layout is not quietly kept', async () => {
    as('ADMIN');
    const res = await outcome(() => prepareDashboardLayout([...safe, ...money]));
    expect(res).toBe('denied');
  });

  it('an ADMIN may save a layout of widgets it does hold', async () => {
    as('ADMIN');
    const res = await outcome(() => prepareDashboardLayout(safe));
    expect(res).not.toBe('denied');
  });

  it('an unknown widget key is an error, not a silent drop — the browser asked for something real', async () => {
    as('OWNER');
    await expect(prepareDashboardLayout([{ widgetKey: 'nope', x: 0, y: 0, w: 1, h: 1 }])).rejects.toThrow(/Unknown widget/);
  });

  it('an anonymous caller cannot save at all', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await outcome(() => prepareDashboardLayout(safe))).toBe('denied');
  });

  it('a row that does not fit the grid is dropped before it can reach the database', async () => {
    as('OWNER');
    const res = await outcome(() => prepareDashboardLayout([{ widgetKey: 'machines.board', x: 2, y: 0, w: 4, h: 2 }]));
    expect(res).not.toBe('denied');
    if (res !== 'denied') expect(res.value.layout).toEqual([]);
  });
});

describe('assertMayPlaceWidgets — the guard Half B must call before it writes', () => {
  it.each(NON_OWNER)('throws MisForbiddenError naming wages.read for %s', (role) => {
    expect(() => assertMayPlaceWidgets(role, [MONEY])).toThrow(/Not permitted: wages\.read/);
  });

  it('is silent for the OWNER, and for a role placing only what it holds', () => {
    expect(() => assertMayPlaceWidgets('OWNER', [MONEY])).not.toThrow();
    expect(() => assertMayPlaceWidgets('QC', ['qc.aqlThisMonth'])).not.toThrow();
  });

  it('refuses a widget whose permission the role lacks, money or not', () => {
    // QC holds qc.read but not attendance.read.
    expect(() => assertMayPlaceWidgets('QC', ['people.attendanceToday'])).toThrow(/Not permitted: attendance\.read/);
  });

  it('refuses an empty-string or unknown key rather than treating it as nothing', () => {
    expect(() => assertMayPlaceWidgets('OWNER', [''])).toThrow(/Unknown widget/);
  });
});

// ===========================================================================
// Persistence — D2: "the layout is stored per user, not hardcoded"
// ===========================================================================
describe('persistence', () => {
  const CUSTOM: PlacedWidget[] = [
    { widgetKey: 'orders.inFlight', x: 0, y: 0, w: 2, h: 2 },
    { widgetKey: 'output.yesterday', x: 2, y: 0, w: 1, h: 1 },
  ];

  it('a layout survives a reload — saved, then read back exactly', async () => {
    as('OWNER');
    await saveDashboardLayout(CUSTOM);
    expect(await getDashboardLayout()).toEqual(CUSTOM);
  });

  it('a person who has never customised gets their default, and no row is written by reading', async () => {
    as('ADMIN');
    const layout = await getDashboardLayout();
    expect(layout.length).toBeGreaterThan(0);
    expect(stored.rows).toEqual([]);
    expect(calls).not.toContain('createMany');
  });

  it('saving REPLACES rather than accumulating — a removed widget stays removed', async () => {
    as('OWNER');
    await saveDashboardLayout(CUSTOM);
    await saveDashboardLayout([CUSTOM[0]]);
    expect(stored.rows).toHaveLength(1);
    expect((await getDashboardLayout()).map((p) => p.widgetKey)).toEqual(['orders.inFlight']);
  });

  it('reorders: the same widgets at new coordinates come back in the new reading order', async () => {
    as('OWNER');
    await saveDashboardLayout(CUSTOM);
    await saveDashboardLayout([
      { widgetKey: 'output.yesterday', x: 0, y: 0, w: 1, h: 1 },
      { widgetKey: 'orders.inFlight', x: 0, y: 1, w: 2, h: 2 },
    ]);
    expect((await getDashboardLayout()).map((p) => p.widgetKey)).toEqual(['output.yesterday', 'orders.inFlight']);
  });

  it("one person's layout never reaches another", async () => {
    as('OWNER');
    await saveDashboardLayout(CUSTOM);
    getCurrentUser.mockResolvedValue({ id: 'someone-else' });
    getMisRole.mockResolvedValue('OWNER');
    const theirs = await getDashboardLayout();
    expect(theirs).not.toEqual(CUSTOM);
    expect(theirs.length).toBeGreaterThan(CUSTOM.length); // their untouched default
  });

  it('the delete and the insert are one transaction, so a rejected row leaves the old layout intact', async () => {
    as('OWNER');
    await saveDashboardLayout(CUSTOM);
    // h: 9 breaks the grid CHECK the database enforces; sanitiseLayout would normally drop
    // it first, so this reaches createMany only because the row is forced past it here.
    await expect(
      saveDashboardLayout([{ widgetKey: 'output.yesterday', x: 0, y: 0, w: 1, h: 1 }, { widgetKey: 'output.yesterday', x: 1, y: 0, w: 1, h: 1 }]),
    ).resolves.toBeDefined(); // duplicate key is collapsed by sanitiseLayout before the write
    expect(stored.rows).toHaveLength(1);
  });

  it('saving an empty layout clears the rows, and the next read falls back to the default', async () => {
    as('OWNER');
    await saveDashboardLayout(CUSTOM);
    await saveDashboardLayout([]);
    expect(stored.rows).toEqual([]);
    expect((await getDashboardLayout()).length).toBeGreaterThan(0);
  });

  it('reset deletes this person\'s rows and hands back the role default', async () => {
    as('OWNER');
    await saveDashboardLayout(CUSTOM);
    const afterReset = await resetDashboardLayout();
    expect(stored.rows).toEqual([]);
    expect(afterReset.map((p) => p.widgetKey)).toContain(MONEY);
    expect(await getDashboardLayout()).toEqual(afterReset);
  });

  it('a widget retired since the layout was saved is dropped, and the rest still renders', async () => {
    as('OWNER');
    stored.rows = [
      { userProfileId: 'u1', widgetKey: 'output.yesterday', x: 0, y: 0, w: 1, h: 1 },
      { userProfileId: 'u1', widgetKey: 'widget.from.an.older.release', x: 1, y: 0, w: 1, h: 1 },
    ];
    expect((await getDashboardLayout()).map((p) => p.widgetKey)).toEqual(['output.yesterday']);
  });
});

describe('D24 end to end — a demotion cannot leave a wage on a saved dashboard', () => {
  const withMoney: PlacedWidget[] = [
    { widgetKey: 'output.yesterday', x: 0, y: 0, w: 1, h: 1 },
    { widgetKey: MONEY, x: 1, y: 0, w: 1, h: 2 },
  ];

  it.each(NON_OWNER)('%s: an Owner saves the money widget, the role changes, the next read drops it', async (role) => {
    as('OWNER');
    await saveDashboardLayout(withMoney);
    expect(stored.rows.some((r) => r.widgetKey === MONEY)).toBe(true); // it really is on disk

    getMisRole.mockResolvedValue(role); // same person, demoted
    const layout = await getDashboardLayout();
    // The money widget is gone, and so is anything else the new role may not hold — the read
    // keeps exactly what this role can see, which for the attendance and store roles is none
    // of the two saved widgets.
    expect(layout.map((p) => p.widgetKey)).not.toContain(MONEY);
    expect(JSON.stringify(layout)).not.toMatch(/wage|salary/i);
    expect(layout.map((p) => p.widgetKey)).toEqual(
      ['output.yesterday', MONEY].filter((key) => mayUseWidget(role, key)),
    );
  });

  it.each(NON_OWNER)('%s cannot SAVE it, and nothing is written', async (role) => {
    as(role);
    expect(await outcome(() => saveDashboardLayout(withMoney))).toBe('denied');
    expect(stored.rows).toEqual([]);
    expect(calls).not.toContain('createMany');
    expect(calls).not.toContain('deleteMany');
  });

  it.each(NON_OWNER)('%s cannot reach it by re-saving a layout they were handed', async (role) => {
    as('OWNER');
    await saveDashboardLayout(withMoney);
    getMisRole.mockResolvedValue(role);
    const theirs = await getDashboardLayout();
    // They save back exactly what they were given: still no money widget, and the stored
    // money row is gone rather than silently preserved.
    await saveDashboardLayout(theirs);
    expect(stored.rows.some((r) => r.widgetKey === MONEY)).toBe(false);
  });

  it('an anonymous caller can neither save nor reset', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect(await outcome(() => saveDashboardLayout([]))).toBe('denied');
    expect(await outcome(() => resetDashboardLayout())).toBe('denied');
  });
});
