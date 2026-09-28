import { test, expect } from '@playwright/test';

import { ROLES, EXPECTED_NAV, MUST_NOT_SEE, hrefFor, storageStatePath } from './roles';

/**
 * The rendered desktop sidebar, role by role, against `navigation.test.ts`'s own EXPECTED table.
 * `navigation.test.ts` already proves `navigationForRole()` returns the right list; this proves
 * the real page actually renders that list as clickable links — the gap a live manual test found
 * (QC seeing Approvals) was a real UI symptom of a permission bug the unit tests alone didn't
 * catch, because nothing rendered the nav for a real login before now.
 */
for (const role of ROLES) {
  test.describe(`${role} — nav visibility`, () => {
    test.use({ storageState: storageStatePath(role) });

    test(`sees exactly its own menu, no more, no less`, async ({ page }) => {
      await page.goto('/mis');
      const expected = EXPECTED_NAV[role];
      for (const id of expected) {
        await expect(page.locator(`a[href="${hrefFor(id)}"]`).first(), `${role} should see '${id}'`).toBeVisible();
      }
      const forbidden = MUST_NOT_SEE[role] ?? [];
      for (const id of forbidden) {
        await expect(page.locator(`a[href="${hrefFor(id)}"]`), `${role} must NOT see '${id}' (F-13)`).toHaveCount(0);
      }
    });

    test('never sees a wage/payroll link unless it holds wages.read', async ({ page }) => {
      await page.goto('/mis');
      const shouldSeePayroll = role === 'OWNER';
      await expect(page.locator('a[href="/mis/payroll"]')).toHaveCount(shouldSeePayroll ? 1 : 0);
    });
  });
}
