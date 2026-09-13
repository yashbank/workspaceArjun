import type { ReactNode } from 'react';

import { MisShell } from '@/components/mis/shell/mis-shell';
import { getNavigationFor, splitNavigation } from '@/server/mis/navigation';
import { getLocale } from '@/server/mis/preferences';
import { getMisRole } from '@/server/mis/roles';
import { requireMisAccess } from '@/server/mis/guard';

import { setLocaleAction } from '../actions';

/**
 * The MIS route group.
 *
 * Its own layout, deliberately not nested inside the live product's chrome —
 * nothing under here can affect the file-management app, and nothing there
 * renders inside this.
 *
 * The flag guard runs before anything else: an unflagged account gets a 404
 * from this line and never learns the route exists.
 */
export default async function MisLayout({ children }: { children: ReactNode }) {
  const user = await requireMisAccess();

  const [role, locale, nav] = await Promise.all([
    getMisRole(user.id),
    getLocale(user.id),
    getNavigationFor(user.id),
  ]);

  const { primary } = splitNavigation(nav);

  return (
    <MisShell
      factoryName="Bhaskar Paper Products"
      userName={user.name ?? user.email}
      role={role}
      locale={locale}
      navPrimary={primary}
      navAll={nav}
      onLocaleChange={setLocaleAction}
    >
      {children}
    </MisShell>
  );
}
