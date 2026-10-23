'use client';

import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import type { Locale } from '@/lib/mis/i18n';
import type { MisRoleName } from '@/lib/mis/roles';
import type { NavEntry } from '@/server/mis/navigation';

import { DesktopShell } from '../desktop/desktop-shell';
import { RoleBadge } from '../roles/role-badge';
import { BottomNav as RoleBottomNav } from '../home/bottom-nav';
import { GlobalSearch } from '../search/global-search';
import { SlideOver } from '../kit/slide-over';
import { LangToggle } from './lang-toggle';
import { NotificationBell, NotificationProvider } from './notification-bell';
import { ServiceWorkerRegistration } from './service-worker-registration';
import { SyncIndicator } from './sync-indicator';
import { MisLocaleProvider, useT } from './locale-provider';

export type MisShellProps = {
  factoryName: string;
  /** The signed-in user's id — announced to the offline worker so cached pages stay tied to one person (D16). */
  userId: string;
  userName: string;
  role: MisRoleName | null;
  locale: Locale;
  /** Already filtered by the server to what this user may open. */
  navAll: NavEntry[];
  /** The phone "More" sheet's list (D32): empty unless the role's fifth tab is More. */
  navMore?: NavEntry[];
  /** Counts for the bottom bar, keyed by tab id. Computed once in the layout. */
  navBadges?: Record<string, number>;
  onLocaleChange: (locale: Locale) => Promise<void>;
  children: ReactNode;
};

/**
 * The frame every MIS screen lives inside.
 *
 * Designed at 360px first: a phone held in one hand by someone standing at a
 * machine. The desktop layout is the same content with the nav moved to a rail,
 * not a different design.
 */
export function MisShell({
  factoryName,
  userId,
  userName,
  role,
  locale,
  navAll,
  navMore,
  navBadges,
  onLocaleChange,
  children,
}: MisShellProps) {
  return (
    <MisLocaleProvider initialLocale={locale}>
      {/* MIS is light-only: `.mis-light` (globals.css) re-declares the light colour tokens so a
          phone in dark mode never turns inherited text near-white on the white cards. `contents`
          keeps it out of layout. */}
      <div className="mis-light contents" data-mis-light="">
      <NotificationProvider userId={userId} role={role}>
      <ServiceWorkerRegistration userId={userId} />

      {/* TWO LAYOUTS, ONE COMPONENT TREE (D1/D3). Both chromes are rendered and CSS alone
          decides which is on screen: the desktop frame from 1024px up, the phone frame
          below it. `children` is the same element in both — a screen is written once, and
          there is no third layout and no JS breakpoint able to disagree with the CSS. */}
      <DesktopShell
        factoryName={factoryName}
        userName={userName}
        role={role}
        nav={navAll}
        navBadges={navBadges}
        topBarRight={
          <>
            <NotificationBell />
            <SyncIndicator />
            <LangToggle onPersist={onLocaleChange} />
          </>
        }
      >
        {children}
      </DesktopShell>

      <div className="flex min-h-dvh flex-col bg-slate-50 lg:hidden">
        <Header userName={userName} role={role} onLocaleChange={onLocaleChange} />

        {/* pb-20 clears the fixed bottom bar; without it the last row of any
            list sits underneath it and cannot be tapped. */}
        <main className="min-w-0 flex-1 px-4 py-4 pb-20">{children}</main>

        <RoleBottomNav role={role} badges={navBadges} more={navMore} />
      </div>
      </NotificationProvider>
      </div>
    </MisLocaleProvider>
  );
}

/**
 * The phone top bar — 24G-part1 gap 1.
 *
 * The design (R1–R5) has no persistent strip above the page: the home screen's own greeting
 * card carries the identity and the A|अ toggle, and every other screen just starts with its
 * content. This compromises between that and needing SOME orientation (who am I, what role)
 * on the ninety-odd phone screens that are not the home: one line, role chip + name, capped
 * at 48px (`h-12`) — not the factory name and "Signed in as" sentence that used to sit above
 * it, and not a second A|अ toggle on the one screen (home) whose own card already has one.
 */
function Header({
  userName,
  role,
  onLocaleChange,
}: {
  userName: string;
  role: MisRoleName | null;
  onLocaleChange: (locale: Locale) => Promise<void>;
}) {
  const pathname = usePathname();
  const isHome = pathname === '/mis';
  const [searchOpen, setSearchOpen] = useState(false);
  const t = useT();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4">
        <RoleBadge role={role} />
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{userName}</p>
        <div className="flex shrink-0 items-center gap-2">
          {/* R2-148: shop-floor roles had no search access at all on a phone. */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={t('desk.search')}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </button>
          {/* V2: live bell for Owner / Admin / Store Guy; renders nothing for anyone else. */}
          <NotificationBell />
          {/* Always visible, never a surprise (08-Empty-error-offline.png). */}
          <SyncIndicator />
          {/* Home's greeting card carries its own A|अ (cards.tsx LangPill) — a second one here
              would be the duplicate toggle the design never shows. */}
          {!isHome && <LangToggle onPersist={onLocaleChange} />}
        </div>
      </header>
      <SlideOver open={searchOpen} onClose={() => setSearchOpen(false)} title={t('desk.search')} placement="bottom">
        <div className="p-4">
          <GlobalSearch autoFocus onNavigate={() => setSearchOpen(false)} />
        </div>
      </SlideOver>
    </>
  );
}
