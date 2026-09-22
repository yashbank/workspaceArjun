/**
 * The phone's "More" tab (D32, F-27).
 *
 * Owner, Admin and Supervisor have far more screens than five thumb targets can carry, so on a
 * phone their FIFTH tab is "More": a sheet that lists every screen the role may open. The list is
 * the server's permission-derived navigation (`navigationForRole` in `server/mis/navigation.ts`,
 * the same table the desktop sidebar reads), so the two cannot disagree. This file only decides
 * WHO gets the tab and HOW the list is grouped; it never adds or removes an entry.
 *
 * Pure: no React, no Prisma. The client bar and the server layout both import it.
 */

import type { MisRoleName } from './roles';
import type { TranslationKey } from './i18n';

/** The three roles whose fifth tab is More. Every other role keeps its fixed five (or one) tabs. */
export const MORE_TAB_ROLES: readonly MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR'];

export function hasMoreTab(role: MisRoleName | null | undefined): boolean {
  return !!role && MORE_TAB_ROLES.includes(role);
}

/** The sheet's sections, in reading order; OTHER catches an entry this file has no home for. */
export const MORE_GROUPS = ['STORE', 'PEOPLE', 'PRODUCTION', 'RECORDS', 'ADMIN', 'OTHER'] as const;
export type MoreGroup = (typeof MORE_GROUPS)[number];

/** Navigation entry id to its section. */
const GROUP_OF: Record<string, MoreGroup> = {
  store: 'STORE',
  inventory: 'STORE',
  grn: 'STORE',
  po: 'STORE',
  suppliers: 'STORE',

  attendance: 'PEOPLE',
  leave: 'PEOPLE',
  crew: 'PEOPLE',
  kiosk: 'PEOPLE',
  employees: 'PEOPLE',
  payroll: 'PEOPLE',

  orders: 'PRODUCTION',
  production: 'PRODUCTION',
  'machine-board': 'PRODUCTION',
  quality: 'PRODUCTION',
  bom: 'PRODUCTION',
  customers: 'PRODUCTION',
  approvals: 'PRODUCTION',

  documents: 'RECORDS',
  traceability: 'RECORDS',
  reports: 'RECORDS',
  audit: 'RECORDS',

  masters: 'ADMIN',
  settings: 'ADMIN',
  'settings-users': 'ADMIN',
  'settings-rules': 'ADMIN',
  me: 'ADMIN',
};

export function moreGroupLabelKey(group: MoreGroup): TranslationKey {
  return `more.group.${group}` as TranslationKey;
}

export type MoreEntryLike = { id: string };
export type MoreListing<T extends MoreEntryLike> = { group: MoreGroup; entries: T[] };

/** Group entries into sections, keeping the server's order inside each; an empty section is absent. */
export function groupMoreNav<T extends MoreEntryLike>(entries: readonly T[]): MoreListing<T>[] {
  return MORE_GROUPS.map((group) => ({
    group,
    entries: entries.filter((e) => (GROUP_OF[e.id] ?? 'OTHER') === group),
  })).filter((listing) => listing.entries.length > 0);
}
