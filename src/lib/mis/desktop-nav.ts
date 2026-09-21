/**
 * The desktop sidebar's shape (D3).
 *
 * "Grouped by department, not by table: Production · Quality · People. The same grouping as
 * the widget library, and the same grouping the factory itself uses when it talks about who
 * does what."
 *
 * This groups the entries the SERVER already decided this person may see
 * (`getNavigationFor`). It never adds one: the desktop cannot widen the phone's menu, and
 * `navigation.test.ts` pins that menu per role. An entry this file has no home for still
 * appears, under the trailing unlabelled section, so a nav item added later cannot silently
 * vanish from the desktop.
 *
 * Pure: no React, no Prisma.
 */

import type { TranslationKey } from './i18n';

/** The three labelled sections, then the trailing one that carries everything else. */
export const DESKTOP_NAV_SECTIONS = ['PRODUCTION', 'QUALITY', 'PEOPLE', 'OTHER'] as const;
export type DesktopNavSection = (typeof DESKTOP_NAV_SECTIONS)[number];

/** Nav entry ids (from `server/mis/navigation.ts`) to the department they belong to. */
const SECTION_OF: Record<string, DesktopNavSection> = {
  orders: 'PRODUCTION',
  production: 'PRODUCTION',
  'machine-board': 'PRODUCTION',
  machines: 'PRODUCTION',
  bom: 'PRODUCTION',
  customers: 'PRODUCTION',
  traceability: 'PRODUCTION',
  approvals: 'PRODUCTION',

  quality: 'QUALITY',

  attendance: 'PEOPLE',
  employees: 'PEOPLE',
  kiosk: 'PEOPLE',
  payroll: 'PEOPLE',

  // Everything else — masters, store, inventory, po, grn, suppliers, documents, reports,
  // settings, audit — falls through to OTHER by the function below.
};

/** The label for a section heading. OTHER has none: it is a rule, not a department. */
export function sectionLabelKey(section: DesktopNavSection): TranslationKey | null {
  return section === 'OTHER' ? null : (`group.${section}` as TranslationKey);
}

export type NavLike = { id: string };
export type DesktopNavSectionListing<T extends NavLike> = { section: DesktopNavSection; entries: T[] };

/**
 * Group the permitted entries into D3's sections, preserving the server's order within each.
 * A section with nothing in it is absent — D3: "A role that cannot reach a section does not
 * see a disabled item — the item is absent. Nothing in this rail is ever greyed out."
 */
export function groupDesktopNav<T extends NavLike>(entries: readonly T[]): DesktopNavSectionListing<T>[] {
  return DESKTOP_NAV_SECTIONS.map((section) => ({
    section,
    entries: entries.filter((e) => (SECTION_OF[e.id] ?? 'OTHER') === section),
  })).filter((listing) => listing.entries.length > 0);
}
