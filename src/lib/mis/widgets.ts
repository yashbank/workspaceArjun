/**
 * The widget library — the catalogue behind D1 and D2.
 *
 * Pure: no Prisma, no React. The same table answers the server (which widgets may this
 * role be offered, which may it save) and the browser (how big is this widget, what is
 * it called), and the two can never disagree — the mistake `lib/mis/permissions.ts`
 * exists to prevent, applied to the dashboard.
 *
 * Three rules from the artboards are encoded here rather than in a screen:
 *
 * 1. **Sizes are on a grid, not free-form** (D2). Every widget declares `w × h` in grid
 *    units on a four-column grid. Nothing overlaps, nothing needs collision code, and the
 *    same layout renders at any width by re-flowing columns.
 * 2. **Role filtering happens on the server** (D2). Each widget names the permission it
 *    needs. The money widget needs `wages.read`, so the money group is ABSENT from a
 *    Supervisor's catalogue — not greyed, not hidden with CSS (D24, and the class of leak
 *    Phase 14F closed five of).
 * 3. **A retired widget must not break a saved layout** (D2). Layouts are rows keyed by
 *    `widgetKey`, and `sanitiseLayout` drops a key this file no longer knows.
 */

import type { TranslationKey } from './i18n';
import { can, type MisAction } from './permissions';
import type { MisRoleName } from './roles';

/** Four columns, twelve slots (D2). The grid is the whole layout system. */
export const GRID_COLUMNS = 4;
export const GRID_SLOTS = 12;
/** D1's tallest widget is three rows; the database CHECK constraint agrees. */
export const MAX_WIDGET_HEIGHT = 3;

/**
 * Grouped by question, not by table (D2) — and the same grouping the sidebar uses (D3)
 * and the factory itself uses when it talks about who does what.
 */
export const WIDGET_GROUPS = ['PRODUCTION', 'QUALITY', 'PEOPLE', 'MONEY'] as const;
export type WidgetGroup = (typeof WIDGET_GROUPS)[number];

export type WidgetDefinition = {
  key: string;
  group: WidgetGroup;
  /** i18n keys — a widget never carries an English string, the same rule as every component. */
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  /** Grid units. */
  w: number;
  h: number;
  /** The permission that decides whether this widget is offered at all. */
  requires: MisAction;
};

/**
 * The library. Fourteen widgets for an Owner, which is what D2's panel counts.
 *
 * Adding one is a deliberate act: `widgets.test.ts` asserts the count, the sizes fit the
 * grid, and every key has both an English and a Hindi string.
 */
export const WIDGETS: readonly WidgetDefinition[] = [
  // --- Production ---
  { key: 'output.yesterday', group: 'PRODUCTION', titleKey: 'widget.output.yesterday', descriptionKey: 'widget.output.yesterday.about', w: 1, h: 1, requires: 'production.read' },
  { key: 'wastage.yesterday', group: 'PRODUCTION', titleKey: 'widget.wastage.yesterday', descriptionKey: 'widget.wastage.yesterday.about', w: 1, h: 1, requires: 'production.read' },
  { key: 'machines.running', group: 'PRODUCTION', titleKey: 'widget.machines.running', descriptionKey: 'widget.machines.running.about', w: 1, h: 1, requires: 'production.read' },
  { key: 'output.againstPlan', group: 'PRODUCTION', titleKey: 'widget.output.againstPlan', descriptionKey: 'widget.output.againstPlan.about', w: 3, h: 2, requires: 'production.read' },
  { key: 'wastage.byPhase', group: 'PRODUCTION', titleKey: 'widget.wastage.byPhase', descriptionKey: 'widget.wastage.byPhase.about', w: 2, h: 1, requires: 'production.read' },
  { key: 'machines.board', group: 'PRODUCTION', titleKey: 'widget.machines.board', descriptionKey: 'widget.machines.board.about', w: 4, h: 2, requires: 'production.read' },
  { key: 'orders.onTime', group: 'PRODUCTION', titleKey: 'widget.orders.onTime', descriptionKey: 'widget.orders.onTime.about', w: 1, h: 1, requires: 'orders.read' },
  { key: 'orders.inFlight', group: 'PRODUCTION', titleKey: 'widget.orders.inFlight', descriptionKey: 'widget.orders.inFlight.about', w: 2, h: 2, requires: 'orders.read' },
  { key: 'orders.waitingOnYou', group: 'PRODUCTION', titleKey: 'widget.orders.waitingOnYou', descriptionKey: 'widget.orders.waitingOnYou.about', w: 1, h: 2, requires: 'orders.read' },

  // --- Quality ---
  { key: 'qc.aqlThisMonth', group: 'QUALITY', titleKey: 'widget.qc.aqlThisMonth', descriptionKey: 'widget.qc.aqlThisMonth.about', w: 2, h: 1, requires: 'qc.read' },
  { key: 'qc.defectsOpen', group: 'QUALITY', titleKey: 'widget.qc.defectsOpen', descriptionKey: 'widget.qc.defectsOpen.about', w: 2, h: 1, requires: 'qc.read' },

  // --- People ---
  { key: 'people.attendanceToday', group: 'PEOPLE', titleKey: 'widget.people.attendanceToday', descriptionKey: 'widget.people.attendanceToday.about', w: 1, h: 1, requires: 'attendance.read' },
  { key: 'people.crewToday', group: 'PEOPLE', titleKey: 'widget.people.crewToday', descriptionKey: 'widget.people.crewToday.about', w: 1, h: 1, requires: 'attendance.read' },

  // --- Money ---
  // The one widget no other role can add. D1: "the API never sends it to them."
  { key: 'money.wagesAccrued', group: 'MONEY', titleKey: 'widget.money.wagesAccrued', descriptionKey: 'widget.money.wagesAccrued.about', w: 1, h: 2, requires: 'wages.read' },
] as const;

const BY_KEY = new Map(WIDGETS.map((w) => [w.key, w]));

/** The definition for a key, or null if this release no longer has one. */
export function widgetByKey(key: string): WidgetDefinition | null {
  return BY_KEY.get(key) ?? null;
}

/** May this role hold this widget at all? The single question both the catalogue and the save path ask. */
export function mayUseWidget(role: MisRoleName | null | undefined, key: string): boolean {
  const widget = BY_KEY.get(key);
  return widget !== undefined && can(role, widget.requires);
}

/** Every widget this role may be offered, in library order. */
export function widgetsFor(role: MisRoleName | null | undefined): WidgetDefinition[] {
  return WIDGETS.filter((w) => can(role, w.requires));
}

export type WidgetGroupListing = { group: WidgetGroup; widgets: WidgetDefinition[] };

/**
 * The catalogue as D2 draws it: grouped, and a group with nothing in it is absent rather
 * than empty — a Supervisor does not see an empty "Money" heading.
 */
export function catalogueFor(role: MisRoleName | null | undefined): WidgetGroupListing[] {
  const visible = widgetsFor(role);
  return WIDGET_GROUPS.map((group) => ({ group, widgets: visible.filter((w) => w.group === group) })).filter(
    (entry) => entry.widgets.length > 0,
  );
}

/** One placed widget: the shape of a layout row (D2 — rows, not a JSON blob). */
export type PlacedWidget = { widgetKey: string; x: number; y: number; w: number; h: number };

function fitsGrid(p: { x: number; y: number; w: number; h: number }): boolean {
  return (
    Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.w) && Number.isInteger(p.h) &&
    p.x >= 0 && p.y >= 0 && p.w >= 1 && p.h >= 1 &&
    p.x + p.w <= GRID_COLUMNS && p.h <= MAX_WIDGET_HEIGHT
  );
}

/**
 * What a stored layout means TODAY, for THIS role.
 *
 * Every rule here is a rule about trust, and each drops a row rather than throwing —
 * a person whose role changed should get a working dashboard, not an error page:
 *
 * - a key this release no longer defines is dropped (D2: "a widget retired in a later
 *   release is dropped by key on read, so an old layout never breaks a dashboard");
 * - a widget the role may not hold is dropped, so a layout saved while someone was an
 *   Owner cannot still show them wages after a demotion (D24);
 * - a row that does not fit the four-column grid is dropped;
 * - a size that disagrees with the library is corrected to the library's, because the
 *   definition is the authority on how big a widget is;
 * - a duplicate key keeps the first row only.
 *
 * Sorted into reading order (top row first, then left to right) so the same layout always
 * renders the same way and a one-column phone gets a sensible order for free.
 */
export function sanitiseLayout(
  rows: readonly PlacedWidget[],
  role: MisRoleName | null | undefined,
): PlacedWidget[] {
  const seen = new Set<string>();
  const kept: PlacedWidget[] = [];

  for (const row of rows) {
    const widget = BY_KEY.get(row.widgetKey);
    if (!widget) continue;
    if (!can(role, widget.requires)) continue;
    if (seen.has(row.widgetKey)) continue;
    const placed = { widgetKey: row.widgetKey, x: row.x, y: row.y, w: widget.w, h: widget.h };
    if (!fitsGrid(placed)) continue;
    seen.add(row.widgetKey);
    kept.push(placed);
  }

  return kept.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

/**
 * Flow an ordered list of widget keys onto the four-column grid, left to right, wrapping
 * when the next widget will not fit.
 *
 * This is why reordering needs no collision code (D2): a layout IS an order, and the
 * geometry is derived from it. Moving a widget is moving it in the list; the grid re-flows.
 * Keys the role may not hold, or that this release no longer defines, are skipped.
 */
export function flowLayout(keys: readonly string[], role: MisRoleName | null | undefined): PlacedWidget[] {
  const placed: PlacedWidget[] = [];
  const seen = new Set<string>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  for (const key of keys) {
    const widget = BY_KEY.get(key);
    if (!widget || seen.has(key) || !can(role, widget.requires)) continue;
    seen.add(key);

    if (x + widget.w > GRID_COLUMNS) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    placed.push({ widgetKey: key, x, y, w: widget.w, h: widget.h });
    x += widget.w;
    rowHeight = Math.max(rowHeight, widget.h);
  }

  return placed;
}

/**
 * The layout a person gets before they have ever pressed Customise.
 *
 * Built from the library in order, so it is correct for every role by construction: a role
 * that cannot see the money widget simply never has it placed, and no per-role layout has
 * to be maintained by hand.
 */
export function defaultLayoutFor(role: MisRoleName | null | undefined): PlacedWidget[] {
  return flowLayout(WIDGETS.map((w) => w.key), role);
}
