'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import type { Locale } from '@/lib/mis/i18n';
import type { MisRoleName } from '@/lib/mis/roles';
import type { NavEntry } from '@/server/mis/navigation';

import { DesktopShell } from '../desktop/desktop-shell';
import { RoleBadge } from '../roles/role-badge';
import { BottomNav as RoleBottomNav } from '../home/bottom-nav';
import { LangToggle } from './lang-toggle';
import { ServiceWorkerRegistration } from './service-worker-registration';
import { SyncIndicator } from './sync-indicator';
import { MisLocaleProvider } from './locale-provider';

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

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4">
      <RoleBadge role={role} />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{userName}</p>
      <div className="flex shrink-0 items-center gap-2">
        {/* Always visible, never a surprise (08-Empty-error-offline.png). */}
        <SyncIndicator />
        {/* Home's greeting card carries its own A|अ (cards.tsx LangPill) — a second one here
            would be the duplicate toggle the design never shows. */}
        {!isHome && <LangToggle onPersist={onLocaleChange} />}
      </div>
    </header>
  );
}
