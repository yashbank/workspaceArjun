// READ-ONLY round-2 QA. ROLES=OWNER,ADMIN ... E2E_BASE_URL=http://localhost:3000. Navigation/screenshots only; never saves.
import { test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
if (!BASE.startsWith('http://localhost')) throw new Error('golive QA must target localhost only');
const rows = readFileSync(`${homedir()}/golive-credentials/credentials-20261112.csv`, 'utf8').trim().split('\n').slice(1).map((r) => r.split(','));
const pick = (role: string) => rows.find((r) => r[1] === role);
const cred = (role: string) => {
  if (role === 'OWNER') return { email: process.env.E2E_OWNER_EMAIL!, pw: process.env.E2E_PASSWORD! };
  if (role === 'ATTENDANCE_OPERATOR') return { email: process.env.E2E_ATTENDANCE_OPERATOR_EMAIL!, pw: process.env.E2E_PASSWORD! };
  const r = pick(role)!; return { email: r[2], pw: r[3].trim() };
};
const ROLES = (process.env.ROLES ?? '').split(',').filter(Boolean);
const B2 = ['/mis/orders', '/mis/production', '/mis/bom', '/mis/qc', '/mis/po', '/mis/grn', '/mis/supplier-invoices', '/mis/inventory', '/mis/suppliers', '/mis/audit', '/mis/store/stock', '/mis/store/transactions', '/mis/crew', '/mis/payroll', '/mis/dashboard', '/mis/employees', '/mis/me/account', '/mis/attendance', '/mis/reports', '/mis/masters'];
const MONEY = /₹|\bRs\.?\s?\d|wage|salary|\brate\b|payroll/gi;

async function check(page: Page, url: string, errs: string[], role: string, shot: boolean, tag: string) {
  const o: any = { url, tag };
  const before = errs.length;
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    o.status = resp?.status(); o.final = new URL(page.url()).pathname;
    const body = (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n');
    o.text = body.slice(0, 5000);
    o.notFound = /404|could not be found|page not found/i.test(body.slice(0, 600));
    o.errorBoundary = /something went wrong|application error|unexpected error|Only plain objects/i.test(body);
    o.hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    o.brand = await page.locator('[data-testid="brand-mark"]:visible').count();
    o.main = await page.locator('main').first().boundingBox().catch(() => null);
    o.vw = page.viewportSize()?.width;
    const hits = [...body.matchAll(new RegExp(MONEY))].map((m) => { const i = m.index!; return body.slice(Math.max(0, i - 25), i + 35).replace(/\n/g, ' '); });
    o.money = hits.slice(0, 6);
    o.empty = /no .* yet|nothing|no (orders|records|results|data|items)|empty/i.test(body);
  } catch (e: any) { o.error = String(e.message).slice(0, 200); }
  o.errs = errs.slice(before);
  if (shot) await page.screenshot({ path: `e2e/golive/screenshots/r2-${role}-${tag}-${url.replace(/[^a-z0-9]/gi, '_')}.png`, fullPage: true }).catch(() => {});
  return o;
}

for (const role of ROLES) {
  test(`r2 ${role}`, async ({ browser }) => {
    test.setTimeout(1500000);
    const c = cred(role);
    const res: any = { role, pages: {}, extra: {} };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 160)}`); });
    page.on('pageerror', (e) => errs.push(`pageerror: ${String(e).slice(0, 160)}`));
    page.on('requestfailed', (r) => errs.push(`reqfailed: ${r.url().slice(0, 100)}`));
    page.on('response', (r) => { if (r.status() >= 400) errs.push(`http${r.status()}: ${r.url().slice(0, 100)}`); });
    await page.goto('/login');
    await page.locator('#email').fill(c.email); await page.locator('#password').fill(c.pw);
    await page.getByRole('button', { name: /sign in/i }).click();
    try { await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 }); } catch { res.login = 'FAIL'; res.loginText = (await page.locator('body').innerText()).slice(0, 300); await page.screenshot({ path: `e2e/golive/screenshots/r2-${role}-login-fail.png` }); writeFileSync(`e2e/golive/results/r2-${role}.json`, JSON.stringify(res, null, 1)); return; }
    errs.length = 0;
    res.home = await check(page, '/mis', errs, role, true, 'desktop');
    res.landing = res.home.final;
    res.sidebar = await page.locator('aside a[href^="/mis"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')))]);
    const side = new Set<string>(res.sidebar);
    for (const u of [...new Set([...res.sidebar, ...B2])].filter((u) => u !== '/mis')) {
      const o = await check(page, u, errs, role, true, 'desktop');
      o.inSidebar = side.has(u);
      // extra probes
      if (o.final === u && !o.notFound) {
        if (u === '/mis/employees') {
          o.rowActions = await page.locator('tbody tr').first().locator('a,button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { name: e.getAttribute('aria-label') || (e as HTMLElement).innerText.trim() || e.getAttribute('title'), w: Math.round(r.width), h: Math.round(r.height) }; })).catch(() => []);
          o.rowCount = await page.locator('tbody tr').count();
        }
        if (u === '/mis/qc') o.selects = await page.locator('select, [role="combobox"]').count();
        if (u === '/mis/payroll' && role === 'OWNER') {
          o.tabs = {};
          for (const t of ['Register', 'Overview', 'Preflight', 'Exports & Banking']) {
            const tab = page.getByRole('tab', { name: t });
            if (await tab.count()) { await tab.click(); await page.waitForTimeout(300); o.tabs[t] = { selected: await tab.getAttribute('aria-selected'), visiblePanels: await page.locator('[role="tabpanel"]:visible').count(), len: (await page.locator('[role="tabpanel"]:visible').first().innerText().catch(() => '')).length }; } else o.tabs[t] = 'MISSING';
          }
          await page.screenshot({ path: `e2e/golive/screenshots/r2-${role}-payroll-exports.png`, fullPage: true });
        }
        if (u === '/mis/dashboard') {
          const btn = page.getByRole('button', { name: /customi[sz]e/i }).first();
          if (await btn.count()) {
            await btn.click(); await page.waitForTimeout(600);
            const t = await page.locator('body').innerText();
            o.catalogue = Object.fromEntries(['Low stock alerts', 'Inward PO fulfilment', 'BOM pipeline', 'Scrap rate trend'].map((w) => [w, t.includes(w)]));
            o.moneyGroup = /\bMoney\b/i.test(t.slice(t.indexOf('Customi')));
            await page.screenshot({ path: `e2e/golive/screenshots/r2-${role}-dashboard-customise.png`, fullPage: true });
            await page.keyboard.press('Escape');
          } else o.catalogue = 'NO CUSTOMISE BUTTON';
        }
      }
      res.pages[u] = o;
    }
    // combobox focus check on first page that has one
    for (const u of ['/mis/orders', '/mis/qc', '/mis/employees']) {
      if (!res.pages[u] || res.pages[u].final !== u) continue;
      await page.goto(u, { waitUntil: 'networkidle' });
      const cb = page.locator('[role="combobox"]').first();
      if (await cb.count()) { await cb.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300); res.extra.combobox = { url: u, options: await page.locator('[role="option"]').count() }; await page.keyboard.press('Escape'); break; }
    }
    // responsive
    const first6 = res.sidebar.filter((u: string) => u !== '/mis').slice(0, 6);
    for (const [name, vp] of [['tablet', { width: 820, height: 1180 }], ['phone', { width: 390, height: 844 }]] as const) {
      await page.setViewportSize(vp);
      for (const u of ['/mis', ...first6]) res.pages[`${u}@${name}`] = await check(page, u, errs, role, u === '/mis', name);
    }
    writeFileSync(`e2e/golive/results/r2-${role}.json`, JSON.stringify(res, null, 1));
    await ctx.close();
  });
}
