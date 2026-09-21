/**
 * The desktop dashboard: the widget catalogue, and the layout a person sees.
 *
 * D2 states the rule this module exists to enforce: **role filtering happens on the
 * server.** "The money group is absent from a Supervisor's library response — not greyed
 * out, not hidden with CSS. Same rule as the money card itself: if the figure never
 * reaches the browser, no amount of devtools poking finds it." That is D24, and it is the
 * class of leak Phase 14F closed five of.
 *
 * So there are two different refusals here, deliberately:
 *
 * - **Reading** the catalogue or a layout never throws — it OMITS. A Supervisor asking
 *   for the library gets a library without a money group; someone demoted yesterday gets
 *   their dashboard back minus the widgets they may no longer hold. An error page would
 *   be the wrong answer to "show me my dashboard".
 * - **Writing** a layout throws `MisForbiddenError` for a widget the caller may not hold.
 *   Placing a widget is an act, and a refused act should say so rather than quietly
 *   dropping what was asked for.
 *
 * Reuse, not a second data path: nothing here fetches factory data. A widget names the
 * permission it needs and the screen calls the phone layer's existing server functions to
 * fill it — this is a second VIEW of the same data (Phase 24's own rule).
 */

import {
  catalogueFor,
  defaultLayoutFor,
  mayUseWidget,
  sanitiseLayout,
  widgetByKey,
  type PlacedWidget,
  type WidgetGroupListing,
} from '@/lib/mis/widgets';
import type { MisRoleName } from '@/lib/mis/roles';
import { getCurrentUser } from '@/server/auth';
import { db } from '@/server/db';

import { MisForbiddenError } from './auth';
import { getMisRole } from './roles';

/** The signed-in person's MIS role, or null. Every export below starts here. */
async function currentRole(): Promise<{ userId: string; role: MisRoleName | null } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return { userId: user.id, role: await getMisRole(user.id) };
}

/**
 * The widget library for whoever is asking (D2).
 *
 * Groups with nothing in them are absent, so a Supervisor sees Production and Quality and
 * simply has no Money heading to wonder about.
 */
export async function getDashboardCatalogue(): Promise<WidgetGroupListing[]> {
  const session = await currentRole();
  if (!session) return [];
  return catalogueFor(session.role);
}

/**
 * This person's dashboard layout.
 *
 * No stored rows means they have never customised, and they get the default for their role
 * — built from the library, so it is correct for every role by construction.
 *
 * Every stored row is re-checked on the way OUT, not only on the way in. A layout saved
 * while someone was an Owner must not still show them wages the day after a demotion, and a
 * widget this release retired must not break the dashboard around it (D2, D24). That is
 * `sanitiseLayout`, and it is the same function the write path uses.
 */
export async function getDashboardLayout(): Promise<PlacedWidget[]> {
  const session = await currentRole();
  if (!session) return [];

  const rows = await db.misDashboardWidget.findMany({
    where: { userProfileId: session.userId },
    select: { widgetKey: true, x: true, y: true, w: true, h: true },
    orderBy: [{ y: 'asc' }, { x: 'asc' }],
  });

  // "Never customised" and "customised into nothing" are the same state on purpose: there is
  // no row that means "deliberately empty", and an empty dashboard helps nobody. Clearing
  // every widget is therefore the same act as Reset to default, which D2 keeps always
  // available anyway.
  if (rows.length === 0) return sanitiseLayout(defaultLayoutFor(session.role), session.role);

  return sanitiseLayout(rows, session.role);
}

/**
 * Replace this person's layout with `rows`.
 *
 * All of it or none of it: the delete and the insert share one transaction, so a failed save
 * cannot leave somebody with half a dashboard. The permission check runs first and refuses
 * the WHOLE layout rather than saving the part it likes (`prepareDashboardLayout`).
 *
 * Not audited, deliberately. `logAuditEvent` records what the MIS did to the factory's
 * records; where a person put their own widgets is furniture, like `setLocale`, and writing
 * it to the audit trail would bury real events under rearrangements.
 */
export async function saveDashboardLayout(rows: readonly PlacedWidget[]): Promise<PlacedWidget[]> {
  const { userId, layout } = await prepareDashboardLayout(rows);

  await db.$transaction([
    db.misDashboardWidget.deleteMany({ where: { userProfileId: userId } }),
    db.misDashboardWidget.createMany({
      data: layout.map((p) => ({ userProfileId: userId, widgetKey: p.widgetKey, x: p.x, y: p.y, w: p.w, h: p.h })),
    }),
  ]);

  return layout;
}

/** Back to the role's default — D2: "Reset is always available." */
export async function resetDashboardLayout(): Promise<PlacedWidget[]> {
  const session = await currentRole();
  if (!session) throw new MisForbiddenError('production.read', 'reset a dashboard layout');

  await db.misDashboardWidget.deleteMany({ where: { userProfileId: session.userId } });
  return sanitiseLayout(defaultLayoutFor(session.role), session.role);
}

/**
 * Refuse a layout that places a widget this role may not hold.
 *
 * The save path's gate, exported so it is tested on its own rather than only through the
 * writer. Checked BEFORE anything is written, and it refuses the whole layout rather
 * than silently saving the allowed part of it — a save that quietly drops a widget is how
 * someone concludes the dashboard is broken.
 */
export function assertMayPlaceWidgets(role: MisRoleName | null | undefined, keys: readonly string[]): void {
  for (const key of keys) {
    if (widgetByKey(key) === null) throw new Error(`Unknown widget: ${key}`);
    if (!mayUseWidget(role, key)) {
      const widget = widgetByKey(key);
      throw new MisForbiddenError(widget!.requires, `place the ${key} widget`);
    }
  }
}

/**
 * Validate a layout the browser sent, for the signed-in person.
 *
 * `saveDashboardLayout` is this function plus the write. It stays split out so the decision
 * — may this person place these widgets, and does the layout fit the grid — is testable
 * without a database.
 */
export async function prepareDashboardLayout(rows: readonly PlacedWidget[]): Promise<{
  userId: string;
  layout: PlacedWidget[];
}> {
  const session = await currentRole();
  if (!session) throw new MisForbiddenError('production.read', 'save a dashboard layout');

  assertMayPlaceWidgets(session.role, rows.map((r) => r.widgetKey));

  // The grid rules and the library's own sizes are applied here as well, so a layout that
  // passed the permission check still cannot store a widget hanging off the right edge.
  // The database CHECK constraint is the third line of the same defence.
  return { userId: session.userId, layout: sanitiseLayout(rows, session.role) };
}
