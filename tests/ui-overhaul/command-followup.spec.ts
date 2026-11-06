import { test, expect } from '@playwright/test';

import { storageStatePath } from '../../e2e/roles';

/** R8 follow-up: searchable dropdown on Command+Popover, OS-aware search shortcut, wastage report range. */
test.use({ storageState: storageStatePath('OWNER') });

test.describe('Combobox (Command + Popover)', () => {
  test('type to filter, arrows + Enter pick, Escape closes, field is 48px and 16px', async ({ page }) => {
    await page.goto('/mis/audit');
    const box = page.locator('#audit-entity');
    await box.focus();
    await expect(page.getByRole('listbox')).toBeVisible();
    const size = await box.evaluate((el) => ({ h: el.getBoundingClientRect().height, f: getComputedStyle(el).fontSize }));
    expect(size.h).toBeGreaterThanOrEqual(48);
    expect(size.f).toBe('16px');
    const rows = page.getByRole('option');
    test.skip((await rows.count()) < 2, 'needs at least two options in the first dropdown');
    expect((await rows.first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeHidden();
    await box.focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
  });
});

for (const [name, platform, hint, mod] of [
  ['Mac', 'MacIntel', '⌘K', 'Meta'],
  ['Windows', 'Win32', 'Ctrl K', 'Control'],
] as const) {
  test.describe(`search shortcut on ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((p) => {
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => p });
        Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
      }, platform);
    });

    test(`shows ${hint}, ${mod}+K focuses the search, no hydration warning`, async ({ page }) => {
      const bad: string[] = [];
      page.on('console', (m) => { if (/hydrat/i.test(m.text())) bad.push(m.text()); });
      page.on('pageerror', (e) => { if (/hydrat/i.test(e.message)) bad.push(e.message); });
      await page.goto('/mis/dashboard');
      await expect(page.locator('kbd', { hasText: hint })).toBeVisible();
      const search = page.getByRole('combobox', { name: /search/i }).first();
      await page.keyboard.press(`${mod === 'Meta' ? 'Control' : 'Meta'}+k`);
      await expect(search).not.toBeFocused();
      await page.keyboard.press(`${mod}+k`);
      await expect(search).toBeFocused();
      expect(bad).toEqual([]);
    });
  });
}

test.describe('Wastage report honours the range tabs', () => {
  test('freq and at survive the week buttons; a past at moves the window', async ({ page }) => {
    await page.goto('/mis/reports?freq=month&at=2026-01-15');
    await expect(page.getByRole('tab', { name: 'Month', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Jan 2026').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    // The summary ends on the last day of the past range, not today.
    await expect(page.locator('body')).toContainText('31/01/2026');
    await page.getByRole('navigation', { name: 'Period' }).getByRole('link', { name: '13', exact: true }).click();
    await expect(page).toHaveURL(/weeks=13/);
    await expect(page).toHaveURL(/freq=month/);
    await expect(page).toHaveURL(/at=2026-01-15/);
    await expect(page.locator('body')).toContainText('31/01/2026');
  });
});
