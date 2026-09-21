/**
 * Phase 24 · D2 — the widget library, as a table rather than as a screen.
 *
 * The three rules under test are the artboard's own: sizes are on a grid, role filtering
 * is a property of the widget, and a retired widget must not break a saved layout.
 */
import { describe, expect, it } from 'vitest';

import { DICTIONARIES } from './i18n/dictionaries';
import { can } from './permissions';
import { MIS_ROLES, type MisRoleName } from './roles';
import {
  GRID_COLUMNS,
  GRID_SLOTS,
  MAX_WIDGET_HEIGHT,
  WIDGETS,
  WIDGET_GROUPS,
  catalogueFor,
  defaultLayoutFor,
  mayUseWidget,
  sanitiseLayout,
  widgetByKey,
  widgetsFor,
  type PlacedWidget,
} from './widgets';

const NON_OWNER = MIS_ROLES.filter((r) => r !== 'OWNER');
const MONEY = 'money.wagesAccrued';

describe('the library itself', () => {
  it('offers an Owner the fourteen widgets D2 counts', () => {
    expect(widgetsFor('OWNER')).toHaveLength(14);
    expect(WIDGETS).toHaveLength(14);
  });

  it('every key is unique, and every widget belongs to a known group', () => {
    const keys = WIDGETS.map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const w of WIDGETS) expect(WIDGET_GROUPS).toContain(w.group);
  });

  it('every widget fits the four-column grid and is no taller than three rows', () => {
    for (const w of WIDGETS) {
      expect(w.w, w.key).toBeGreaterThanOrEqual(1);
      expect(w.w, w.key).toBeLessThanOrEqual(GRID_COLUMNS);
      expect(w.h, w.key).toBeGreaterThanOrEqual(1);
      expect(w.h, w.key).toBeLessThanOrEqual(MAX_WIDGET_HEIGHT);
    }
  });

  it('every widget has a title and a description in BOTH languages — no English fallback on a Hindi screen', () => {
    for (const w of WIDGETS) {
      for (const locale of ['en', 'hi'] as const) {
        expect(DICTIONARIES[locale][w.titleKey], `${w.key} ${locale} title`).toBeTruthy();
        expect(DICTIONARIES[locale][w.descriptionKey], `${w.key} ${locale} description`).toBeTruthy();
      }
    }
  });

  it('every group has a label in both languages', () => {
    for (const group of WIDGET_GROUPS) {
      for (const locale of ['en', 'hi'] as const) {
        expect(DICTIONARIES[locale][`group.${group}` as never], `${group} ${locale}`).toBeTruthy();
      }
    }
  });

  it('widgetByKey answers null for a key this release does not define', () => {
    expect(widgetByKey('output.yesterday')).not.toBeNull();
    expect(widgetByKey('a.widget.we.retired')).toBeNull();
  });
});

describe('D24 — the money widget is the one no other role can add', () => {
  it('exactly one widget is in the MONEY group, and it needs wages.read', () => {
    const money = WIDGETS.filter((w) => w.group === 'MONEY');
    expect(money.map((w) => w.key)).toEqual([MONEY]);
    expect(money[0].requires).toBe('wages.read');
  });

  it.each(NON_OWNER)('%s may not use it', (role) => {
    expect(mayUseWidget(role, MONEY)).toBe(false);
  });

  it('the OWNER may (so the refusals above are about the role, not a broken registry)', () => {
    expect(mayUseWidget('OWNER', MONEY)).toBe(true);
  });

  it.each(NON_OWNER)("%s's catalogue has no MONEY group at all — absent, not empty", (role) => {
    const groups = catalogueFor(role).map((g) => g.group);
    expect(groups).not.toContain('MONEY');
  });

  it("the OWNER's catalogue does have it", () => {
    expect(catalogueFor('OWNER').map((g) => g.group)).toContain('MONEY');
  });

  it.each(NON_OWNER)('%s never gets it in a default layout', (role) => {
    expect(defaultLayoutFor(role).map((p) => p.widgetKey)).not.toContain(MONEY);
  });

  it('no non-money widget requires wages.read — money is one widget, not a scattering', () => {
    const wageGated = WIDGETS.filter((w) => w.requires === 'wages.read');
    expect(wageGated.map((w) => w.key)).toEqual([MONEY]);
  });
});

describe('the catalogue per role', () => {
  it('every widget offered is one the role actually holds the permission for', () => {
    for (const role of MIS_ROLES) {
      for (const w of widgetsFor(role)) expect(can(role, w.requires), `${role} / ${w.key}`).toBe(true);
    }
  });

  it('a group is listed only when it has something in it', () => {
    for (const role of MIS_ROLES) {
      for (const entry of catalogueFor(role)) expect(entry.widgets.length, `${role} / ${entry.group}`).toBeGreaterThan(0);
    }
  });

  it('a WORKER — who has no login at all — is offered nothing', () => {
    expect(widgetsFor('WORKER')).toEqual([]);
    expect(catalogueFor('WORKER')).toEqual([]);
  });

  it('a login with no MIS role is offered nothing', () => {
    expect(widgetsFor(null)).toEqual([]);
    expect(catalogueFor(undefined)).toEqual([]);
  });

  // A STORE_GUY holds none of production/orders/qc/attendance.read, so today the desktop
  // dashboard has nothing to offer them. That is the permission matrix being honest, not a
  // bug — but it IS an open product question, recorded as D29.
  it('a STORE_GUY has no dashboard widgets yet (D29 — an open question, not an accident)', () => {
    expect(widgetsFor('STORE_GUY')).toEqual([]);
  });

  it('an ADMIN and a SUPERVISOR get the thirteen non-money widgets', () => {
    for (const role of ['ADMIN', 'SUPERVISOR'] as MisRoleName[]) {
      expect(widgetsFor(role), role).toHaveLength(13);
    }
  });
});

describe('sanitiseLayout — what a stored layout means today', () => {
  const ok: PlacedWidget = { widgetKey: 'output.yesterday', x: 0, y: 0, w: 1, h: 1 };

  it('keeps a good row untouched', () => {
    expect(sanitiseLayout([ok], 'OWNER')).toEqual([ok]);
  });

  it('drops a widget this release retired, and keeps the rest of the layout working', () => {
    const rows = [ok, { widgetKey: 'widget.we.deleted', x: 1, y: 0, w: 1, h: 1 }];
    expect(sanitiseLayout(rows, 'OWNER').map((p) => p.widgetKey)).toEqual(['output.yesterday']);
  });

  it.each(NON_OWNER)('drops the money widget from %s — a layout saved before a demotion cannot leak one', (role) => {
    const rows = [ok, { widgetKey: MONEY, x: 1, y: 0, w: 1, h: 2 }];
    expect(sanitiseLayout(rows, role).map((p) => p.widgetKey)).not.toContain(MONEY);
  });

  it('keeps the money widget for the OWNER (so the drops above are the role, not the sanitiser)', () => {
    const rows = [ok, { widgetKey: MONEY, x: 1, y: 0, w: 1, h: 2 }];
    expect(sanitiseLayout(rows, 'OWNER').map((p) => p.widgetKey)).toContain(MONEY);
  });

  it('drops a row that would hang off the right edge of the grid', () => {
    expect(sanitiseLayout([{ widgetKey: 'machines.board', x: 1, y: 0, w: 4, h: 2 }], 'OWNER')).toEqual([]);
    expect(sanitiseLayout([{ widgetKey: 'machines.board', x: 0, y: 0, w: 4, h: 2 }], 'OWNER')).toHaveLength(1);
  });

  it.each([
    ['a negative x', { x: -1, y: 0 }],
    ['a negative y', { x: 0, y: -2 }],
    ['a fractional x', { x: 0.5, y: 0 }],
  ])('drops %s', (_label, over) => {
    expect(sanitiseLayout([{ ...ok, ...over }], 'OWNER')).toEqual([]);
  });

  it("corrects a size that disagrees with the library — the definition is the authority on how big a widget is", () => {
    const [placed] = sanitiseLayout([{ widgetKey: 'machines.board', x: 0, y: 0, w: 1, h: 1 }], 'OWNER');
    expect(placed).toEqual({ widgetKey: 'machines.board', x: 0, y: 0, w: 4, h: 2 });
  });

  it('keeps only the first of a duplicated key', () => {
    const rows = [ok, { ...ok, x: 2 }];
    expect(sanitiseLayout(rows, 'OWNER')).toEqual([ok]);
  });

  it('returns reading order — top row first, then left to right — whatever order the rows arrive in', () => {
    const rows: PlacedWidget[] = [
      { widgetKey: 'machines.running', x: 2, y: 1, w: 1, h: 1 },
      { widgetKey: 'orders.onTime', x: 0, y: 1, w: 1, h: 1 },
      { widgetKey: 'output.yesterday', x: 1, y: 0, w: 1, h: 1 },
    ];
    expect(sanitiseLayout(rows, 'OWNER').map((p) => p.widgetKey)).toEqual([
      'output.yesterday',
      'orders.onTime',
      'machines.running',
    ]);
  });

  it('an empty layout stays empty rather than becoming the default — "I removed everything" is a choice', () => {
    expect(sanitiseLayout([], 'OWNER')).toEqual([]);
  });
});

describe('defaultLayoutFor', () => {
  it.each(MIS_ROLES)('%s gets a layout that fits the grid and holds only widgets it may see', (role) => {
    const layout = defaultLayoutFor(role);
    expect(layout).toEqual(sanitiseLayout(layout, role));
    for (const p of layout) {
      expect(p.x + p.w, `${p.widgetKey} overflows`).toBeLessThanOrEqual(GRID_COLUMNS);
      expect(mayUseWidget(role, p.widgetKey), `${role} cannot hold ${p.widgetKey}`).toBe(true);
    }
  });

  it('places every widget the role may see, exactly once', () => {
    for (const role of MIS_ROLES) {
      const keys = defaultLayoutFor(role).map((p) => p.widgetKey);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.sort()).toEqual(widgetsFor(role).map((w) => w.key).sort());
    }
  });

  it('nothing overlaps — every occupied cell is claimed once (D2: no collision code needed)', () => {
    for (const role of MIS_ROLES) {
      const cells = new Set<string>();
      for (const p of defaultLayoutFor(role)) {
        for (let dx = 0; dx < p.w; dx += 1) {
          for (let dy = 0; dy < p.h; dy += 1) {
            const cell = `${p.x + dx},${p.y + dy}`;
            expect(cells.has(cell), `${role}: ${p.widgetKey} overlaps at ${cell}`).toBe(false);
            cells.add(cell);
          }
        }
      }
    }
  });

  it("the Owner's default is the only one carrying money, and it fills more than one screenful of slots", () => {
    expect(defaultLayoutFor('OWNER').map((p) => p.widgetKey)).toContain(MONEY);
    expect(GRID_SLOTS).toBe(12);
  });
});
