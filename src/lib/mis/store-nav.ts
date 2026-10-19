/**
 * R2-64 — the Store module's grouped sidebar: Dashboard, Goods Issue, Receipts, Transactions.
 *
 * Each link carries the permission it needs and is dropped (absent, never greyed) for a role that does not hold
 * it. The groups are fixed; a group with no visible link disappears.
 *
 * Pure: no React, no Prisma.
 */
import { can, type MisAction } from './permissions';
import type { MisRoleName } from './roles';

export type StoreNavGroupId = 'DASHBOARD' | 'ISSUE' | 'RECEIPTS' | 'TRANSACTIONS';

export type StoreNavLink = { id: string; label: string; href: string; requires: MisAction };
export type StoreNavGroup = { id: StoreNavGroupId; label: string; links: StoreNavLink[] };

const GROUPS: { id: StoreNavGroupId; label: string; links: StoreNavLink[] }[] = [
  { id: 'DASHBOARD', label: 'Dashboard', links: [{ id: 'dashboard', label: 'Store overview', href: '/mis/store/dashboard', requires: 'store.read' }] },
  {
    id: 'ISSUE',
    label: 'Goods Issue',
    links: [
      { id: 'issue', label: 'Issue stock', href: '/mis/store/issue', requires: 'store.read' },
      { id: 'requests', label: 'Material requests', href: '/mis/store/requests', requires: 'store.read' },
      { id: 'picklists', label: 'Pick lists', href: '/mis/store/pick-lists', requires: 'store.read' },
      { id: 'returns', label: 'Returns to store', href: '/mis/store/returns', requires: 'store.read' },
    ],
  },
  { id: 'RECEIPTS', label: 'Receipts', links: [{ id: 'receive', label: 'Receive (GRN)', href: '/mis/store/receive', requires: 'grn.write' }] },
  {
    id: 'TRANSACTIONS',
    label: 'Transactions',
    links: [
      { id: 'transactions', label: 'Transaction log', href: '/mis/store/transactions', requires: 'store.read' },
      { id: 'stock', label: 'Stock report', href: '/mis/store/stock', requires: 'store.read' },
      { id: 'count', label: 'Physical count', href: '/mis/store/count', requires: 'store.count' },
    ],
  },
];

export function storeNavFor(role: MisRoleName | null | undefined): StoreNavGroup[] {
  return GROUPS.map((g) => ({ ...g, links: g.links.filter((l) => can(role, l.requires)) })).filter((g) => g.links.length > 0);
}

/** The link lit for a pathname: the longest href that is the path or a parent of it. */
export function activeStoreLink(groups: readonly StoreNavGroup[], pathname: string): string | null {
  let best: StoreNavLink | null = null;
  for (const g of groups) {
    for (const l of g.links) {
      if ((pathname === l.href || pathname.startsWith(`${l.href}/`)) && (!best || l.href.length > best.href.length)) best = l;
    }
  }
  return best?.id ?? null;
}
