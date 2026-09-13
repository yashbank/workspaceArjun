import { allowedActions, type MisAction } from '@/lib/mis/permissions';
import type { TranslationKey } from '@/lib/mis/i18n';

import { getMisRole } from './roles';

/**
 * The navigation config.
 *
 * Resolved on the server and filtered before it is serialised, so the browser
 * never receives a list of screens the user may not open — shipping the whole
 * config and hiding entries in CSS would leak the product's shape (S8).
 *
 * `icon` is a name, not a component: a React component cannot cross the
 * server/client boundary, and a string keeps the payload tiny.
 */

export type NavIcon =
  | 'database'
  | 'clipboard'
  | 'factory'
  | 'check'
  | 'users'
  | 'chart'
  | 'settings'
  | 'wrench';

export type NavEntry = {
  id: string;
  labelKey: TranslationKey;
  href: string;
  icon: NavIcon;
  /** Shown in the mobile bottom bar. At most five ever are. */
  primary: boolean;
};

type NavDefinition = NavEntry & { requires: MisAction };

const NAV: NavDefinition[] = [
  { id: 'masters', labelKey: 'nav.masters', href: '/mis/masters', icon: 'database', primary: true, requires: 'masters.read' },
  { id: 'orders', labelKey: 'nav.orders', href: '/mis/orders', icon: 'clipboard', primary: true, requires: 'orders.read' },
  { id: 'production', labelKey: 'nav.production', href: '/mis/production', icon: 'factory', primary: true, requires: 'production.read' },
  { id: 'quality', labelKey: 'nav.quality', href: '/mis/qc', icon: 'check', primary: true, requires: 'qc.read' },
  { id: 'attendance', labelKey: 'nav.attendance', href: '/mis/attendance', icon: 'users', primary: true, requires: 'attendance.read' },
  { id: 'machines', labelKey: 'nav.machines', href: '/mis/machines', icon: 'wrench', primary: false, requires: 'production.read' },
  { id: 'reports', labelKey: 'nav.reports', href: '/mis/reports', icon: 'chart', primary: false, requires: 'reports.read' },
  { id: 'settings', labelKey: 'nav.settings', href: '/mis/settings', icon: 'settings', primary: false, requires: 'settings.read' },
];

/** The bottom bar holds five at most; a sixth thumb target does not fit at 360px. */
export const MAX_PRIMARY_NAV = 5;

/**
 * The navigation this user is allowed to see.
 *
 * An owner and a QC user requesting the same page get two different payloads.
 */
export async function getNavigationFor(userId: string): Promise<NavEntry[]> {
  const role = await getMisRole(userId);
  const permitted = new Set<MisAction>(allowedActions(role));

  return NAV.filter((entry) => permitted.has(entry.requires)).map(
    ({ requires: _requires, ...entry }) => entry,
  );
}

/** Split a resolved nav into the bottom bar and the overflow menu. */
export function splitNavigation(entries: NavEntry[]): { primary: NavEntry[]; overflow: NavEntry[] } {
  const primary = entries.filter((e) => e.primary).slice(0, MAX_PRIMARY_NAV);
  const primaryIds = new Set(primary.map((e) => e.id));
  return { primary, overflow: entries.filter((e) => !primaryIds.has(e.id)) };
}
