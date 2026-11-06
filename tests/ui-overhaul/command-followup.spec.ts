import { test, expect, type Page } from '@playwright/test';

import { storageStatePath } from '../../e2e/roles';
import { withDb } from './db';

/** R8 follow-up: searchable dropdown on Command+Popover, OS-aware search shortcut, wastage report range. */
test.use({ storageState: storageStatePath('OWNER') });

/** Collects every hydration complaint on the page, from the console and from thrown errors. */
function watchHydration(page: Page) {
  const bad: string[] = [];
  page.on('console', (m) => { if (/hydrat/i.test(m.text())) bad.push(m.text()); });
  page.on('pageerror', (e) => { if (/hydrat/i.test(e.message)) bad.push(e.message); });
  return bad;
}

/** The list must sit inside the viewport, be the top element where it is drawn, and add no sideways scroll. */
async function expectNotClipped(page: Page) {
  const view = page.viewportSize()!;
  // toPass: the popover measures its anchor a frame after it appears.
  await expect(async () => {
    const box = (await page.getByRole('listbox').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(view.width);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height);
    const top = await page.getByRole('listbox').getByRole('option').first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el.contains(hit) ? 'the list' : `${hit?.tagName} ${hit?.className}`;
    });
    expect(top, 'nothing covers the list').toBe('the list');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }).toPass({ timeout: 5_000 });
}

test.describe('Combobox (Command + Popover)', () => {
  test('search, arrows + Enter, mouse pick, Escape and Tab close; field is 48px and 16px; no hydration warning', async ({ page }) => {
    const bad = watchHydration(page);
    await page.goto('/mis/audit');
    const box = page.locator('#audit-entity:visible');
    await box.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    const size = await box.evaluate((el) => ({ h: el.getBoundingClientRect().height, f: getComputedStyle(el).fontSize }));
    expect(size.h).toBeGreaterThanOrEqual(48);
    expect(size.f).toBe('16px');
    const rows = page.getByRole('listbox').getByRole('option');
    // "None" plus at least two entities, or the search below proves nothing.
    expect(await rows.count()).toBeGreaterThanOrEqual(3);
    expect((await rows.first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expectNotClipped(page);

    // Search narrows the list, a miss says so, and the row under the arrow keys is the one Enter picks.
    const label = (await rows.nth(1).innerText()).trim();
    await box.fill('zzz-no-such-entity');
    await expect(page.getByRole('listbox')).toContainText('No matches');
    await box.fill(label);
    await expect(rows.filter({ hasText: label }).first()).toBeVisible();
    await expect(rows.filter({ hasText: 'None' })).toHaveCount(1);
    // A search puts the highlight on the first match, so the arrows go down and back to reach it.
    await expect(rows.filter({ hasText: label }).first()).toHaveAttribute('data-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    await expect(rows.filter({ hasText: label }).first()).toHaveAttribute('data-selected', 'true');
    await expect(box).toHaveAttribute('aria-activedescendant', /.+/);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect.poll(() => new URL(page.url()).searchParams.get('entity')?.toLowerCase()).toBe(label.toLowerCase());
    await expect(page.locator('#audit-entity:visible')).toHaveValue(label);

    // A mouse pick; "None" clears the filter.
    await page.locator('#audit-entity:visible').click();
    await rows.filter({ hasText: 'None' }).click();
    await expect(page).not.toHaveURL(/entity=/);

    const field = page.locator('#audit-entity:visible');
    await field.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    await field.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('listbox')).toBeHidden();
    expect(bad).toEqual([]);
  });

  test('Enter after a search picks the first match and zero matches change nothing; the field keeps Home and End', async ({ page }) => {
    await page.goto('/mis/audit');
    const entity = () => new URL(page.url()).searchParams.get('entity')?.toLowerCase();
    const box = page.locator('#audit-entity:visible');
    await box.click();
    const rows = page.getByRole('listbox').getByRole('option');
    const label = (await rows.nth(1).innerText()).trim();

    // What a screen reader is told, and no leftover cmdk label.
    await expect(page.getByRole('listbox')).toHaveAttribute('aria-label', (await box.evaluate((el: HTMLInputElement) => el.labels![0].textContent))!);
    expect(await box.getAttribute('aria-controls')).toBe(await page.getByRole('listbox').getAttribute('id'));
    await expect(page.locator('[cmdk-label]:visible')).toHaveCount(0);
    expect(await page.locator('[cmdk-label]').first().evaluate((el) => getComputedStyle(el).display)).toBe('none');

    await box.fill(label);
    await page.keyboard.press('Enter');
    await expect.poll(entity).toBe(label.toLowerCase());

    const field = page.locator('#audit-entity:visible');
    await field.click();
    await field.fill('zzz-no-such-entity');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox')).toContainText('No matches');
    expect(entity()).toBe(label.toLowerCase());

    await field.fill('abc');
    const caret = () => field.evaluate((el: HTMLInputElement) => el.selectionStart);
    await page.keyboard.press('Home');
    expect(await caret()).toBe(0);
    await page.keyboard.press('End');
    expect(await caret()).toBe(3);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(page.locator('#audit-entity:visible')).toHaveValue(label);
  });

  for (const { width, height } of [{ width: 1280, height: 800 }, { width: 375, height: 800 }, { width: 375, height: 560 }]) {
    test(`inside a modal at ${width}x${height}: opens over the panel, unclipped, picks, and the panel stays`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/mis/attendance/leave');
      await page.getByRole('button', { name: '+ Request Leave' }).locator('visible=true').click();
      const panel = page.getByRole('dialog', { name: 'Request Leave' });
      await expect(panel).toBeVisible();
      const field = panel.getByRole('combobox', { name: 'Employee' });
      await field.click();
      await expect(panel.getByRole('listbox')).toBeVisible();
      await expectNotClipped(page);

      await field.fill('Fake Worker 17');
      await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(1);
      await expectNotClipped(page);
      await page.getByRole('listbox').getByRole('option').click();
      await expect(page.getByRole('listbox')).toBeHidden();
      await expect(field).toHaveValue('Fake Worker 17 (E-17)');
      await expect(panel).toBeVisible();

      // Escape closes the list first; only a second Escape closes the panel.
      await field.click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toBeHidden();
      await expect(panel).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    });
  }

  test('at 375 on a page: the list stays in the viewport, width of the field', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/mis/audit');
    const box = page.locator('#audit-entity:visible');
    await box.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectNotClipped(page);
    // The popover's 1px border sits around the list.
    expect(Math.abs((await page.getByRole('listbox').boundingBox())!.width - (await box.boundingBox())!.width)).toBeLessThanOrEqual(2);
  });
});

for (const [name, platform, uaData, hint, mod] of [
  ['Mac', 'MacIntel', undefined, '⌘K', 'Meta'],
  ['Mac by userAgentData', 'Win32', 'macOS', '⌘K', 'Meta'],
  ['Windows', 'Win32', undefined, 'Ctrl K', 'Control'],
  ['Linux', 'Linux x86_64', undefined, 'Ctrl K', 'Control'],
] as const) {
  test.describe(`search shortcut on ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(([p, ua]) => {
        Object.defineProperty(Navigator.prototype, 'platform', { get: () => p });
        Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => (ua ? { platform: ua } : undefined) });
      }, [platform, uaData] as const);
    });

    test(`shows ${hint}, ${mod}+K focuses the search, no hydration warning`, async ({ page }) => {
      const bad = watchHydration(page);
      await page.goto('/mis/dashboard');
      await expect(page.locator('kbd:visible', { hasText: hint })).toBeVisible();
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
  const inMain = (page: Page) => page.locator('main:visible');

  test('freq and at survive the week buttons; a past at moves the window', async ({ page }) => {
    await page.goto('/mis/reports?freq=month&at=2026-01-15');
    const main = inMain(page);
    await expect(main.getByRole('tab', { name: 'Month', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(main.getByText('Jan 2026').filter({ visible: true }).first()).toBeVisible();
    await expect(main.getByRole('heading', { level: 1 }).first()).toBeVisible();
    // The summary ends on the last day of the past range, not today.
    await expect(main).toContainText('31/01/2026');
    await main.getByRole('navigation', { name: 'Period' }).getByRole('link', { name: '13', exact: true }).click();
    await expect(page).toHaveURL(/weeks=13/);
    await expect(page).toHaveURL(/freq=month/);
    await expect(page).toHaveURL(/at=2026-01-15/);
    await expect(main).toContainText('31/01/2026');
  });

  test('the report is cut to the range: a year from 1 January, a month inside its month, and the CSV the same days', async ({ page }) => {
    await page.goto('/mis/reports?freq=year&at=2025-03-15');
    const main = inMain(page);
    await expect(main).toContainText('01/01/2025 – 31/12/2025 · 2025');
    const year = await page.request.get((await main.getByRole('link', { name: 'Export CSV' }).getAttribute('href'))!);
    expect(year.headers()['content-disposition']).toContain('wastage-weekly-2025-01-01_2025-12-31.csv');

    await page.goto('/mis/reports?freq=month&at=2026-03-15');
    await expect(main).toContainText('01/03/2026 – 31/03/2026 · Mar 2026');
    await expect(main.getByRole('navigation', { name: 'Period' }).locator('[aria-current]')).toHaveCount(0);

    // A week button is an explicit pick: it counts back from the range's last day and says so.
    await main.getByRole('navigation', { name: 'Period' }).getByRole('link', { name: '4', exact: true }).click();
    await expect(page).toHaveURL(/weeks=4/);
    await expect(main).toContainText('09/03/2026 – 31/03/2026 · 4 weeks');
    await expect(main.getByRole('navigation', { name: 'Period' }).getByRole('link', { name: '4', exact: true })).toHaveAttribute('aria-current', 'true');
  });

  test('the CSV of a past range is that window: same end day, and its waste is the database total for the window', async ({ page }) => {
    // The month before last has seeded production; a fixed month would be empty one day.
    const d = new Date();
    const at = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 15)).toISOString().slice(0, 10);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 0)).toISOString().slice(0, 10);
    await page.goto(`/mis/reports?freq=month&at=${at}`);
    const link = inMain(page).getByRole('link', { name: 'Export CSV' });
    await expect(link).toHaveAttribute('href', new RegExp(`last=${lastDay}`));

    const res = await page.request.get((await link.getAttribute('href'))!);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    const name = /filename="wastage-weekly-(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})\.csv"/.exec(res.headers()['content-disposition'])!;
    expect(name[2]).toBe(lastDay);

    const lines = (await res.text()).trim().split('\r\n').slice(1);
    expect(lines.length).toBeGreaterThan(0);
    const total = lines.reduce((sum, line) => sum + Number(line.split(',').at(-2)), 0);
    const [{ waste }] = await withDb((q) =>
      q<{ waste: string }>(`SELECT coalesce(sum(qty_waste), 0) waste FROM mis_production_log WHERE (logged_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2`, [name[1], name[2]]),
    );
    expect(Number(waste), 'the window holds seeded waste').toBeGreaterThan(0);
    expect(total).toBeCloseTo(Number(waste), 2);

    // The orders part travels on the same window.
    const orders = await page.request.get((await inMain(page).getByRole('link', { name: 'Export orders CSV' }).getAttribute('href'))!);
    expect(orders.status()).toBe(200);
    expect(orders.headers()['content-disposition']).toContain(`_${lastDay}.csv`);
  });
});
