import type { ReactNode } from 'react';

import { MisShell } from '@/components/mis/shell/mis-shell';
import { getNavBadges, getNavigationFor, navigationForRole } from '@/server/mis/navigation';
import { getLocale } from '@/server/mis/preferences';
import { getMisRole } from '@/server/mis/roles';
import { themeCss } from '@/lib/mis/theme';
import { getOrgTheme } from '@/server/mis/theme';
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

  const [role, locale, nav, theme] = await Promise.all([
    getMisRole(user.id),
    getLocale(user.id),
    getNavigationFor(user.id),
    getOrgTheme(),
  ]);

  // Computed once, here, so no individual screen has to remember to do it.
  const navBadges = await getNavBadges(user.id, role);

  // R8 T3: org-wide theme. '' for the default theme, so an unthemed site renders as before. html:has covers portals.
  const css = themeCss(theme, 'html:has(.mis-light),.mis-light');

  return (
    <>
      {css && <style>{css}</style>}
    <MisShell
      factoryName="Bhaskar Paper Products"
      userId={user.id}
      userName={user.name ?? user.email}
      role={role}
      locale={locale}
      navAll={nav}
      navMore={navigationForRole(role, 'phone')}
      navBadges={navBadges}
      onLocaleChange={setLocaleAction}
    >
      {children}
    </MisShell>
    </>
  );
}
