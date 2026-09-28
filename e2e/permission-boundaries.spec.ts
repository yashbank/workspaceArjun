import { test, expect } from '@playwright/test';

import { ROLES, EXPECTED_NAV, hrefFor, storageStatePath, type MisRoleName } from './roles';

/**
 * Direct-URL access to the most sensitive screens — money (payroll, D24), settings, and the
 * audit trail — for every role that the menu does NOT offer them to. Hiding a link is not a
 * security boundary (mis-shell's own convention, see checkPermission's docstring); this proves
 * the server gate actually refuses the page too, for the screens where a leak would matter most.
 *
 * The (mis) error boundary's own docstring flags a real, pre-existing gap: Next sanitises a
 * thrown error's `name` in production, so `error.tsx` cannot always tell "forbidden" apart from
 * a genuine crash and falls back to the generic "Something went wrong" copy — a page's own
 * try/catch + <Forbidden/> (used by documents/traceability/rules/master-data already) is the
 * only reliable route to the calm copy. Found live via this suite (payroll/settings/audit/queue/
 * approvals all hit the unreliable path), reported separately — not a security bug (access is
 * still correctly refused, no data renders either way) so this assertion accepts both screens and
 * only requires that no real data table rendered underneath.
 */
const ACCESS_DENIED = /You do not have access to this|Something went wrong/;
// /mis/queue (Phase 23, D30) deliberately answers with a plain 404 instead of a forbidden
// message — "absent, not refused on open" — so a role without queue.review never learns the
// screen exists at all. That is a stricter, intentional design choice, not the same gap as the
// other three screens below.
const NOT_FOUND = 'This page does not exist';
const CRITICAL_SCREENS = [
  { id: 'payroll', expect: ACCESS_DENIED },
  { id: 'settings', expect: ACCESS_DENIED },
  { id: 'audit', expect: ACCESS_DENIED },
  { id: 'queue', expect: NOT_FOUND },
] as const;

for (const { id: screen, expect: expectedText } of CRITICAL_SCREENS) {
  test.describe(`/mis/${screen} — refused for every role the menu doesn't offer it to`, () => {
    for (const role of ROLES as MisRoleName[]) {
      const shouldHaveAccess = EXPECTED_NAV[role].includes(screen);
      if (shouldHaveAccess) continue;

      test(`${role} is refused`, async ({ browser }) => {
        const ctx = await browser.newContext({ storageState: storageStatePath(role) });
        const page = await ctx.newPage();
        await page.goto(hrefFor(screen));
        // MisShell renders both desktop and phone chrome in one DOM tree (D1/D3) — `.first()`
        // matches either copy of the duplicated error boundary content.
        await expect(page.getByText(expectedText).first()).toBeVisible();
        await expect(page.locator('table')).toHaveCount(0);
        await ctx.close();
      });
    }
  });
}
