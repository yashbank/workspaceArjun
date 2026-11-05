import { mkdirSync, writeFileSync } from 'node:fs';

import { test, expect, type Page } from '@playwright/test';

import { EXPECTED_NAV, ROLES, hrefFor, storageStatePath, type MisRoleName } from '../../e2e/roles';

/**
 * T5: every role's main tabs and tables at the five widths. No horizontal page scroll (a table may scroll inside its own
 * box), and every control is at least 44px on its short side. One load per page; the viewport is resized in place.
 */
const WIDTHS = [375, 1440, 320, 768, 1024];
const HEIGHT = 800;
const TAP = 44;
const LIST_VIEWS: Record<string, string[]> = { orders: ['?view=rows'], bom: ['?view=rows'], po: ['?view=rows'], grn: ['?view=rows'], suppliers: ['?view=rows'], employees: ['?view=rows'] };
const OWNER_EXTRA = ['/mis/dashboard', '/mis/settings/theme', '/mis/settings/danger-zone', '/mis/settings/users', '/mis/settings/rules', '/mis/settings/wages', '/mis/settings/devices', '/mis/settings/aql', '/mis/settings/qc-templates', '/mis/settings/leave-pay'];

const pagesFor = (role: MisRoleName) => {
  const paths = ['/mis', '/mis/dashboard'];
  for (const id of EXPECTED_NAV[role]) {
    paths.push(hrefFor(id));
    for (const suffix of LIST_VIEWS[id] ?? []) paths.push(hrefFor(id) + suffix);
  }
  if (role === 'OWNER') paths.push(...OWNER_EXTRA);
  return [...new Set(paths)];
};

/** `next dev` restarts itself near its memory ceiling, which refuses connections for a few seconds on a small machine. */
async function open(page: Page, path: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(path, { waitUntil: 'load', timeout: 120_000 });
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await page.waitForTimeout(6_000);
    }
  }
}

type Finding = { overflow: number; small: string[] };

function inspect(page: Page, tap: number): Promise<Finding> {
  return page.evaluate((min) => {
    const root = document.documentElement;
    const seen = new Set<string>();
    const small: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('a[href],button,select,textarea,input:not([type=hidden]),[role=button],[role=tab],summary')) {
      const box = (el.matches('input[type=checkbox],input[type=radio]') && el.closest('label')) || el;
      const r = box.getBoundingClientRect();
      const css = getComputedStyle(el);
      if (r.width <= 1 || r.height <= 1 || css.visibility === 'hidden' || css.pointerEvents === 'none' || el.closest('[aria-hidden="true"]')) continue;
      // The month register is a 31-column desktop grid read with a mouse; phones get the daily view instead.
      if (el.closest('[data-testid="month-grid-scroll"]')) continue;
      // WCAG 2.5.8 inline exception: a link inside a running sentence.
      if (el.tagName === 'A' && css.display === 'inline' && el.closest('p')) continue;
      if (Math.min(r.width, r.height) >= min - 0.5) continue;
      const name = `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`;
      if (!seen.has(name)) small.push(name);
      seen.add(name);
    }
    return { overflow: root.scrollWidth - root.clientWidth, small };
  }, tap);
}

for (const role of ROLES) {
  test(`${role}: no sideways scroll, 44px targets`, async ({ browser }, info) => {
    test.setTimeout(540_000);
    const ctx = await browser.newContext({ storageState: storageStatePath(role) });
    const page = await ctx.newPage();
    const problems: string[] = [];
    let checks = 0;
    for (const path of pagesFor(role)) {
      await page.setViewportSize({ width: WIDTHS[0], height: HEIGHT });
      await open(page, path);
      await expect(page.locator('body')).not.toContainText('Something went wrong');
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
        let found = await inspect(page, TAP);
        // A chart keeps its old width until it re-measures, so overflow only counts on a fresh load at this width.
        if (found.overflow > 0) {
          await page.reload({ waitUntil: 'load' });
          found = await inspect(page, TAP);
        }
        checks++;
        if (found.overflow > 0) problems.push(`${path} @${width}: page scrolls sideways by ${found.overflow}px`);
        for (const s of found.small) problems.push(`${path} @${width}: small target ${s}`);
      }
      // In-page tabs show panels the checks above never saw. Phone and desktop only, to keep the run short.
      for (const width of [375, 1440]) {
        await page.setViewportSize({ width, height: HEIGHT });
        const tabs = page.getByRole('tab');
        const count = await tabs.count();
        for (let i = 0; i < count; i++) {
          if (!(await tabs.nth(i).isVisible())) continue;
          const name = (await tabs.nth(i).innerText()).trim();
          await tabs.nth(i).click();
          await page.waitForLoadState('load');
          await page.evaluate(() => new Promise((done) => setTimeout(done, 150)));
          const found = await inspect(page, TAP);
          checks++;
          if (found.overflow > 0) problems.push(`${path} tab "${name}" @${width}: page scrolls sideways by ${found.overflow}px`);
          for (const s of found.small) problems.push(`${path} tab "${name}" @${width}: small target ${s}`);
        }
      }
    }
    await ctx.close();
    mkdirSync('test-results', { recursive: true });
    writeFileSync(`test-results/responsive-${role}.json`, JSON.stringify({ checks, problems }, null, 1));
    info.annotations.push({ type: 'checks', description: String(checks) });
    expect(problems, `${checks} page-width checks`).toEqual([]);
  });
}
