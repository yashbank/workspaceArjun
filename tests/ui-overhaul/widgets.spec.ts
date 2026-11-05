import { test, expect, type Page } from '@playwright/test';

import { ROLES, storageStatePath } from '../../e2e/roles';
import { factoryDateKey } from '../../src/lib/mis/factory-time';
import { FREQS, factoryRangeFromKeys, resolveRange, type Freq } from '../../src/lib/mis/report-range';
import { withDb } from './db';

/** R2 widget frequency: the tabs drive the URL, the label and the figures, and the figures are the database's own. */
const TIME_ZONE = 'Asia/Kolkata';
const today = () => factoryDateKey(new Date(), TIME_ZONE);
const LABEL: Record<Freq, string> = { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' };
const num = (n: number) => n.toLocaleString('en-IN');

async function pick(page: Page, freq: Freq) {
  await page.getByRole('tab', { name: LABEL[freq], exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`freq=${freq}`));
  await expect(page.getByRole('tab', { name: LABEL[freq], exact: true })).toHaveAttribute('aria-selected', 'true');
}

const production = (freq: Freq) => {
  const range = resolveRange({ freq }, today());
  const { from, to } = factoryRangeFromKeys(range.fromKey, range.toKey, TIME_ZONE);
  return withDb(async (q) => {
    const [row] = await q<{ produced: string; waste: string; n: number }>(
      `SELECT coalesce(sum(qty_produced), 0)::text produced, coalesce(sum(qty_waste), 0)::text waste, count(*)::int n
       FROM mis_production_log WHERE logged_at >= $1::timestamp AND logged_at < $2::timestamp AND voided_at IS NULL`,
      [from.toISOString(), to.toISOString()],
    );
    return { label: range.label, produced: Number(row.produced), waste: Number(row.waste), entries: row.n };
  });
};

test.describe('Owner dashboard', () => {
  test.use({ storageState: storageStatePath('OWNER') });

  for (const freq of FREQS) {
    test(`${freq}: label and figures match the database`, async ({ page }) => {
      await page.goto('/mis/dashboard');
      await pick(page, freq);
      const want = await production(freq);
      expect(want.entries, `seed has production in this ${freq}`).toBeGreaterThan(0);
      await expect(page.getByText(want.label, { exact: true }).first()).toBeVisible();
      const body = page.locator('body');
      await expect(body).toContainText(new RegExp(`${num(want.produced)}\\s*KG`));
      await expect(body).toContainText(new RegExp(`${num(want.waste)}\\s*KG`));
    });
  }

  test('figures grow with the range, as the seed spreads over the year', async () => {
    const totals = await Promise.all(FREQS.map(production));
    for (let i = 1; i < totals.length; i++) expect(totals[i].entries).toBeGreaterThanOrEqual(totals[i - 1].entries);
    expect(totals[4].entries).toBeGreaterThan(totals[0].entries);
  });

  test('earlier and later arrows move the range and survive a reload', async ({ page }) => {
    await page.goto('/mis/dashboard?freq=month');
    const start = resolveRange({ freq: 'month' }, today());
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page).toHaveURL(new RegExp(`at=${start.prevAt}`));
    const earlier = resolveRange({ freq: 'month', at: start.prevAt }, today());
    await expect(page.getByText(earlier.label, { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(earlier.label, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByText(start.label, { exact: true }).first()).toBeVisible();
  });

  test('a range with no production shows the empty state, not a zero', async ({ page }) => {
    await page.goto('/mis/dashboard?freq=day&at=2020-01-01');
    await expect(page.getByText('1 Jan 2020', { exact: true }).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/\d\s*KG/);
  });

  test('a bad frequency falls back to the month', async ({ page }) => {
    await page.goto('/mis/dashboard?freq=decade&at=nonsense');
    await expect(page.getByRole('tab', { name: 'Month', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  // From 1024px up /mis/reports is the wastage report; the range tabs live on the classic screen, as on a phone.
  test('reports follow the same range, and the tabs stay on the classic screen', async ({ page }) => {
    for (const freq of FREQS) {
      await page.goto(`/mis/reports?view=classic&freq=${freq}`);
      await expect(page.getByRole('tab', { name: LABEL[freq], exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByText(resolveRange({ freq }, today()).label, { exact: true }).first()).toBeVisible();
    }
    await page.goto('/mis/reports?view=classic');
    await pick(page, 'quarter');
    await expect(page).toHaveURL(/view=classic/);
    await expect(page.getByText(resolveRange({ freq: 'quarter' }, today()).label, { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Previous quarter' }).click();
    await expect(page).toHaveURL(/view=classic/);
    await expect(page.getByRole('tab', { name: 'Quarter', exact: true })).toBeVisible();
  });

  test('a phone reaches the same tabs with no view param', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/mis/reports');
    await pick(page, 'week');
    await expect(page.locator('main:visible').getByText(resolveRange({ freq: 'week' }, today()).label, { exact: true })).toBeVisible();
  });
});

for (const role of ROLES) {
  test(`${role}: every frequency renders the dashboard without an error`, async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath(role) });
    const page = await ctx.newPage();
    for (const freq of FREQS) {
      await page.goto(`/mis/dashboard?freq=${freq}`);
      await expect(page.getByRole('tab', { name: LABEL[freq], exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expect(page.getByText('You do not have access to this')).toHaveCount(0);
    }
    await ctx.close();
  });
}
