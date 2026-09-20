'use client';

import type { ReactNode } from 'react';

import type { Locale } from '@/lib/mis/i18n';
import type { MisRoleName } from '@/lib/mis/roles';
import type { NavEntry } from '@/server/mis/navigation';

import { RoleBadge } from '../roles/role-badge';
import { BottomNav as RoleBottomNav } from '../home/bottom-nav';
import { SideNav } from './bottom-nav';
import { LangToggle } from './lang-toggle';
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
  navBadges,
  onLocaleChange,
  children,
}: MisShellProps) {
  return (
    <MisLocaleProvider initialLocale={locale}>
      <ServiceWorkerRegistration userId={userId} />
      <div className="flex min-h-dvh flex-col bg-slate-50">
        <Header factoryName={factoryName} userName={userName} role={role} onLocaleChange={onLocaleChange} />

        <div className="flex flex-1">
          <SideNav entries={navAll} />
          {/* pb-20 clears the fixed bottom bar; without it the last row of any
              list sits underneath it and cannot be tapped. */}
          <main className="min-w-0 flex-1 px-4 py-4 pb-20 md:pb-4">{children}</main>
        </div>

        <RoleBottomNav role={role} badges={navBadges} />
      </div>
    </MisLocaleProvider>
  );
}

function Header({
  factoryName,
  userName,
  role,
  onLocaleChange,
}: {
  factoryName: string;
  userName: string;
  role: MisRoleName | null;
  onLocaleChange: (locale: Locale) => Promise<void>;
}) {
  const t = useT();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{factoryName}</p>
          <p className="truncate text-sm text-slate-500">
            {t('common.signedInAs')} {userName}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Always visible, never a surprise (08-Empty-error-offline.png). */}
          <SyncIndicator />
          <RoleBadge role={role} />
          <LangToggle onPersist={onLocaleChange} />
        </div>
      </div>
    </header>
  );
}
