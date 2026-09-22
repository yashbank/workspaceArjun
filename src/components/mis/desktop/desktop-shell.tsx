'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Database,
  Factory,
  LayoutGrid,
  Settings,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import { groupDesktopNav, sectionLabelKey } from '@/lib/mis/desktop-nav';
import type { MisRoleName } from '@/lib/mis/roles';
import { cn } from '@/lib/utils';
import type { NavEntry, NavIcon } from '@/server/mis/navigation';

import { RoleBadge } from '../roles/role-badge';
import { useT } from '../shell/locale-provider';

/**
 * The desktop frame — D3. "Every desktop screen is this frame with a different middle."
 *
 * THREE WIDTHS, TWO LAYOUTS, ONE COMPONENT TREE (D3's own breakpoint note):
 *
 *   ≥ 1280px (`xl`)      expanded 240px sidebar
 *   1024–1279px (`lg`)   the same sidebar collapsed to a 68px rail with hover labels
 *   < 1024px             this whole frame is absent; the phone layout (R1–R5) takes over
 *
 * The rail is a WIDTH of the desktop layout, not a layout of its own — same markup, same
 * component, one CSS class. That is why there is no third layout and no JS breakpoint here:
 * a media query that ran in JavaScript would be a third thing to keep in step, and the
 * phone chrome and this chrome would be able to disagree about which one is showing.
 *
 * The sidebar is the one dark surface in the web app. It reads as furniture, not content,
 * so a coloured status pill three pixels from it still means something.
 */

const ICONS: Record<NavIcon, LucideIcon> = {
  database: Database,
  clipboard: ClipboardList,
  factory: Factory,
  check: CheckCircle2,
  users: Users,
  chart: BarChart3,
  settings: Settings,
  wrench: Wrench,
};

export type DesktopShellProps = {
  factoryName: string;
  userName: string;
  role: MisRoleName | null;
  /** Already filtered by the server to what this person may open. Never widened here. */
  nav: NavEntry[];
  navBadges?: Record<string, number>;
  /** The A/अ toggle and anything else the top bar carries, supplied by the layout. */
  topBarRight?: React.ReactNode;
  children: React.ReactNode;
};

export function DesktopShell({
  factoryName,
  userName,
  role,
  nav,
  navBadges,
  topBarRight,
  children,
}: DesktopShellProps) {
  const t = useT();
  const sections = groupDesktopNav(nav);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // 24G-part1 gap 4 — at 1440x900 a long role's nav (e.g. Owner's) overflowed the rail and the
  // active item (Masters) sat half-hidden behind the user footer with no way to tell there was
  // more to scroll to. `min-h-0` is the fix: without it a flex child never shrinks below its
  // own content height, so `overflow-y-auto` below had nothing to scroll — the whole `<aside>`
  // overflowed the viewport instead of just this list, and the footer never got pinned.
  useEffect(() => {
    // Optional-chained on the call, not just the lookup: jsdom (this file's own tests) has no
    // `scrollIntoView` at all, and a real but older webview may not either.
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [pathname]);

  return (
    // `hidden lg:flex` is the whole breakpoint story: below 1024px this frame does not
    // render at all and the phone shell is what the person sees.
    <div className="hidden min-h-dvh bg-[#faf7f2] lg:flex">
      <aside
        aria-label={t('app.title')}
        className="sticky top-0 flex h-dvh w-[68px] shrink-0 flex-col bg-[#171310] text-slate-200 xl:w-60"
      >
        <div className="flex items-center gap-3 px-3 py-4 xl:px-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f5efe3] text-sm font-bold text-[#171310]">
            BP
          </span>
          {/* The wordmark is part of the expanded rail only; at 68px the monogram is the mark. */}
          <span className="hidden min-w-0 flex-col leading-tight xl:flex">
            <span className="truncate text-sm font-semibold text-white">{t('app.title')}</span>
            <span className="truncate text-[11px] text-slate-400">{factoryName}</span>
          </span>
        </div>

        <nav ref={navRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 xl:px-3">
          <NavItem
            href="/mis/dashboard"
            icon={LayoutGrid}
            label={t('desk.dashboard')}
            badge={0}
            emphasised
          />
          {sections.map(({ section, entries }) => {
            const labelKey = sectionLabelKey(section);
            return (
              <div key={section} className="mt-5">
                {/* The heading is a label for sighted users at full width; at rail width it
                    would be an unreadable stub, so it is hidden there rather than truncated. */}
                {labelKey ? (
                  <p className="mb-1 hidden px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 xl:block">
                    {t(labelKey)}
                  </p>
                ) : (
                  <hr className="mb-2 border-white/10" />
                )}
                {entries.map((entry) => (
                  <NavItem
                    key={entry.id}
                    href={entry.href}
                    icon={ICONS[entry.icon]}
                    label={t(entry.labelKey)}
                    badge={navBadges?.[entry.id] ?? 0}
                  />
                ))}
              </div>
            );
          })}
        </nav>

        <div className="mt-auto shrink-0 flex items-center gap-3 border-t border-white/10 px-3 py-3 xl:px-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
            {initials(userName)}
          </span>
          <span className="hidden min-w-0 flex-col leading-tight xl:flex">
            <span className="truncate text-sm font-medium text-white">{userName}</span>
            <span className="truncate text-[11px] text-slate-400">
              {role ? <RoleBadge role={role} /> : null}
            </span>
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex min-h-[60px] items-center gap-4 border-b border-slate-200 bg-[#faf7f2]/95 px-[18px] backdrop-blur">
          <label className="relative min-w-0 flex-1 max-w-xl">
            <span className="sr-only">{t('desk.search')}</span>
            <input
              type="search"
              placeholder={t('desk.search')}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </label>
          <div className="ml-auto flex items-center gap-3">{topBarRight}</div>
        </header>

        {/* 18px gutter, per the artboard's measurement strip. */}
        <main className="min-w-0 flex-1 px-[18px] py-5">{children}</main>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * One rail item.
 *
 * At 68px the label becomes a hover tooltip carrying the SAME word the expanded rail uses
 * and its count — D3: "An icon with no label is a puzzle. Hover names it and carries its
 * count, and the label is the same word the expanded rail uses — never a shortened one."
 * The label is always in the DOM for assistive tech; only its presentation changes.
 */
function NavItem({
  href,
  icon: Icon,
  label,
  badge,
  emphasised,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  badge: number;
  emphasised?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title={badge > 0 ? `${label} · ${badge}` : label}
      className={cn(
        // 44px target, the same on a laptop as on the floor — "a control that moves or
        // shrinks between them is a control they have to re-learn".
        'group relative mt-0.5 flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-indigo-400',
        active || emphasised
          ? active
            ? 'bg-indigo-600 font-semibold text-white'
            : 'text-slate-200 hover:bg-white/10'
          : 'text-slate-300 hover:bg-white/10',
      )}
    >
      <span className="relative shrink-0">
        <Icon className="size-[22px]" aria-hidden="true" />
        {/* At rail width the count cannot be written out, so it becomes a dot that says
            "there is something here" and the hover label carries the number. */}
        {badge > 0 ? (
          <span className="absolute -right-1 -top-1 size-2 rounded-full bg-red-500 xl:hidden" />
        ) : null}
      </span>
      <span className="hidden min-w-0 flex-1 truncate xl:block">{label}</span>
      {badge > 0 ? (
        <span className="hidden h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white xl:flex">
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The page header every desktop screen carries (D3).
 *
 * "The count is part of the title" — a page title on its own tells you where you are; the
 * line under it tells you whether you need to do anything, before you read a single row.
 *
 * "One primary action per page" — `primary` is the single filled button. Anything quiet
 * (Export, filters) goes in `secondary`, and the type makes the singular deliberate.
 */
export function DesktopPageHeader({
  title,
  summary,
  secondary,
  primary,
}: {
  title: string;
  summary?: string;
  secondary?: React.ReactNode;
  primary?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {summary ? <p className="mt-0.5 font-mono text-xs text-slate-500">{summary}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {secondary}
        {primary}
      </div>
    </div>
  );
}
