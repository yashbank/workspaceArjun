'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { hasMoreTab } from '@/lib/mis/phone-more';
import type { MisRoleName } from '@/lib/mis/roles';
import { cn } from '@/lib/utils';
import type { NavEntry } from '@/server/mis/navigation';

import { useT } from '../shell/locale-provider';
import { MoreSheet } from './more-sheet';

/**
 * The fixed five-tab bar at the foot of every role home.
 *
 * Five tabs, never six: a sixth thumb target does not fit at 360px. The set is
 * chosen per role rather than filtered from one master list, because what a QC
 * operator reaches for all day is not a subset of what an owner reaches for.
 *
 * For Owner, Admin and Supervisor the FIFTH tab is "More" (D32, F-27): it opens a sheet listing
 * every screen the role may open, so a phone reaches Store, GRN, PO, Inventory and the rest. The
 * tab it displaces (Settings / Reports / Me) is in that list. Still five tabs, never six.
 *
 * Icons are inline SVG on purpose — this app ships no icon dependency for the
 * MIS home, and a 22px stroke path costs less than a package.
 */

export type NavTab = {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
};

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'h-[22px] w-[22px]',
  'aria-hidden': true,
} as const;

const Icons = {
  home: (
    <svg {...ICON_PROPS}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  ),
  approvals: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
    </svg>
  ),
  orders: (
    <svg {...ICON_PROPS}>
      <path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2Z" />
      <path d="M9 9h6" />
    </svg>
  ),
  reports: (
    <svg {...ICON_PROPS}>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M21 20H3" />
    </svg>
  ),
  settings: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 18.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2.8a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.1 7L4 6.9a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V2.8a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17 4.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.7 1.2Z" />
    </svg>
  ),
  masters: (
    <svg {...ICON_PROPS}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  ),
  people: (
    <svg {...ICON_PROPS}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16.5 5.5a3.2 3.2 0 0 1 0 6" />
      <path d="M18 14.5a6 6 0 0 1 3 5.5" />
    </svg>
  ),
  machines: (
    <svg {...ICON_PROPS}>
      <path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 1 5.4-5.4l-2.5 2.5 1.8 1.8 2.5-2.5a4 4 0 0 1-4.8-4.8Z" />
    </svg>
  ),
  jobs: (
    <svg {...ICON_PROPS}>
      <path d="M3 20h18" />
      <path d="M4 20V9l5 3V9l5 3V6l6 3v11" />
    </svg>
  ),
  checks: (
    <svg {...ICON_PROPS}>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 7.6 7 9.5 4.1-1.9 7-5.3 7-9.5V6Z" />
      <path d="m9 12 2 2 4-4.5" />
    </svg>
  ),
  defects: (
    <svg {...ICON_PROPS}>
      <path d="M12 4 2.5 20h19Z" />
      <path d="M12 10v4" />
      <path d="M12 17.2h.01" />
    </svg>
  ),
  coa: (
    <svg {...ICON_PROPS}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5" />
      <path d="M9 14h6" />
      <path d="M9 17.5h4" />
    </svg>
  ),
  me: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  ),
  register: (
    <svg {...ICON_PROPS}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
      <path d="m9.5 15 1.8 1.8 3.4-3.6" />
    </svg>
  ),
  leave: (
    <svg {...ICON_PROPS}>
      <rect x="3.5" y="5" width="17" height="16" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
      <path d="m10 14.5 4 4M14 14.5l-4 4" />
    </svg>
  ),
  kiosk: (
    <svg {...ICON_PROPS}>
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </svg>
  ),
  stock: (
    <svg {...ICON_PROPS}>
      <path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2Z" />
      <path d="M4 7.2 12 11.5l8-4.3" />
      <path d="M12 11.5V21" />
    </svg>
  ),
  receive: (
    <svg {...ICON_PROPS}>
      <path d="M12 3v11" />
      <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
      <path d="M4 17.5V20h16v-2.5" />
    </svg>
  ),
  more: (
    <svg {...ICON_PROPS}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  ),
  issue: (
    <svg {...ICON_PROPS}>
      <path d="M12 14V3" />
      <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
      <path d="M4 17.5V20h16v-2.5" />
    </svg>
  ),
} satisfies Record<string, ReactNode>;

const HOME: NavTab = { id: 'home', label: 'Home', href: '/mis', icon: Icons.home };
const ME: NavTab = { id: 'me', label: 'Me', href: '/mis/me', icon: Icons.me };

const TABS: Record<MisRoleName, NavTab[]> = {
  OWNER: [
    HOME,
    { id: 'approvals', label: 'Approvals', href: '/mis/approvals', icon: Icons.approvals },
    { id: 'orders', label: 'Orders', href: '/mis/orders', icon: Icons.orders },
    { id: 'reports', label: 'Reports', href: '/mis/reports', icon: Icons.reports },
    { id: 'settings', label: 'Settings', href: '/mis/settings', icon: Icons.settings },
  ],
  ADMIN: [
    HOME,
    { id: 'orders', label: 'Orders', href: '/mis/orders', icon: Icons.orders },
    { id: 'masters', label: 'Masters', href: '/mis/masters', icon: Icons.masters },
    { id: 'people', label: 'People', href: '/mis/employees', icon: Icons.people },
    { id: 'reports', label: 'Reports', href: '/mis/reports', icon: Icons.reports },
  ],
  SUPERVISOR: [
    HOME,
    { id: 'machines', label: 'Machines', href: '/mis/machine-board', icon: Icons.machines },
    { id: 'jobs', label: 'Jobs', href: '/mis/production', icon: Icons.jobs },
    { id: 'crew', label: 'Crew', href: '/mis/crew', icon: Icons.people },
    ME,
  ],
  QC: [
    HOME,
    { id: 'checks', label: 'Checks', href: '/mis/qc', icon: Icons.checks },
    { id: 'defects', label: 'Defects', href: '/mis/qc/grid', icon: Icons.defects },
    { id: 'coa', label: 'COA', href: '/mis/documents', icon: Icons.coa },
    ME,
  ],
  ATTENDANCE_OPERATOR: [
    HOME,
    { id: 'register', label: 'Register', href: '/mis/attendance', icon: Icons.register },
    { id: 'leave', label: 'Leave', href: '/mis/attendance/leave', icon: Icons.leave },
    { id: 'kiosk', label: 'Kiosk', href: '/mis/kiosk', icon: Icons.kiosk },
    ME,
  ],
  SUPER_ATTENDANCE_OPERATOR: [
    HOME,
    { id: 'register', label: 'Register', href: '/mis/attendance', icon: Icons.register },
    { id: 'leave', label: 'Leave', href: '/mis/attendance/leave', icon: Icons.leave },
    { id: 'kiosk', label: 'Kiosk', href: '/mis/kiosk', icon: Icons.kiosk },
    ME,
  ],
  STORE_GUY: [
    HOME,
    { id: 'stock', label: 'Stock', href: '/mis/store/stock', icon: Icons.stock },
    { id: 'receive', label: 'Receive', href: '/mis/store/receive', icon: Icons.receive },
    { id: 'issue', label: 'Issue', href: '/mis/store/issue', icon: Icons.issue },
    ME,
  ],
  // A worker has no login; the row exists so the map is total.
  WORKER: [HOME],
};

/**
 * Tabs for a role, exported so a page can reason about them without rendering.
 *
 * This is the role's fixed set from MIS_UI_SPEC §4.5 — including the fifth tab that Owner, Admin and
 * Supervisor lose to "More" on a phone. `barForRole` below is what the bar actually draws.
 */
export function tabsForRole(role: MisRoleName | null): NavTab[] {
  return role ? TABS[role] : [HOME];
}

/**
 * What the bar draws: the role's tabs, except that for Owner / Admin / Supervisor the fifth is
 * replaced by More when there is a list to show. With no list (a page that did not pass one) the
 * spec's fixed five stay, so a bar is never left without its fifth destination.
 */
export function barForRole(
  role: MisRoleName | null,
  more?: readonly NavEntry[],
): { tabs: NavTab[]; more: boolean } {
  const tabs = tabsForRole(role);
  if (hasMoreTab(role) && more && more.length > 0) return { tabs: tabs.slice(0, 4), more: true };
  return { tabs, more: false };
}

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNav({
  role,
  badges,
  more,
}: {
  role: MisRoleName | null;
  badges?: Record<string, number>;
  /** The permission-derived list for the More sheet, from the server layout (D32). */
  more?: readonly NavEntry[];
}) {
  const pathname = usePathname();
  const t = useT();
  // The sheet remembers the page it was opened on, so it is open only while that is still the page:
  // following a link (a route change) closes it with no effect and no stale open state.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const sheetOpen = openedOn === pathname;
  // Forget a stale page, so leaving and coming back to it does not resurrect the sheet.
  if (openedOn !== null && openedOn !== pathname) setOpenedOn(null);
  const setSheetOpen = (next: boolean) => setOpenedOn(next ? pathname : null);
  const bar = barForRole(role, more);

  const tabActive = (tab: NavTab) =>
    tab.href === '/mis' ? pathname === '/mis' : pathname.startsWith(tab.href);
  // More is lit when the page is one of its entries and NOT one of the visible tabs.
  const moreActive =
    bar.more && !bar.tabs.some(tabActive) && (more ?? []).some((e) => isCurrent(pathname, e.href));

  return (
    <>
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 mx-auto grid max-w-[420px] grid-cols-5 border-t border-slate-200 bg-white lg:hidden"
      >
        {bar.tabs.map((tab) => {
          const active = tabActive(tab);
          const badge = badges?.[tab.id] ?? 0;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2',
                active ? 'text-indigo-600' : 'text-slate-500',
              )}
            >
              <span className="relative">
                {tab.icon}
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className={cn('text-[11px] leading-none', active && 'font-semibold')}>
                {tab.label}
              </span>
            </Link>
          );
        })}
        {bar.more && (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={t('more.open')}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            data-active={moreActive ? 'true' : undefined}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2',
              moreActive ? 'text-indigo-600' : 'text-slate-500',
            )}
          >
            <span>{Icons.more}</span>
            <span className={cn('text-[11px] leading-none', moreActive && 'font-semibold')}>
              {t('nav.more')}
            </span>
          </button>
        )}
      </nav>
      {bar.more && (
        <MoreSheet
          open={sheetOpen}
          entries={more ?? []}
          pathname={pathname}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}
