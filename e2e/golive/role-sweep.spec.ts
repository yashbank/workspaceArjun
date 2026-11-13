// READ-ONLY go-live QA sweep: logs in once per role, navigates + screenshots only. Never clicks write actions.
// Run: E2E_BASE_URL=http://localhost:3000 npx playwright test -c e2e/golive/playwright.config.ts
import { test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
if (!BASE.startsWith('http://localhost')) throw new Error('golive QA must target localhost only');

function csv() {
  const rows = readFileSync(`${homedir()}/golive-credentials/credentials-20261112.csv`, 'utf8').trim().split('\n').slice(1);
  return rows.map((r) => { const [name, role, email, pw] = r.split(','); return { name, role, email, pw: pw?.trim() }; });
}
const rows = csv();
const pick = (role: string) => rows.find((r) => r.role === role);
type Cred = { role: string; email: string; pw: string };
const creds: Cred[] = [];
if (process.env.E2E_OWNER_EMAIL && process.env.E2E_PASSWORD) creds.push({ role: 'OWNER', email: process.env.E2E_OWNER_EMAIL, pw: process.env.E2E_PASSWORD });
for (const role of ['ADMIN', 'SUPERVISOR', 'QC', 'STORE_GUY', 'SUPER_ATTENDANCE_OPERATOR']) {
  const r = pick(role); if (r) creds.push({ role, email: r.email, pw: r.pw! });
}
if (process.env.E2E_ATTENDANCE_OPERATOR_EMAIL && process.env.E2E_PASSWORD) creds.push({ role: 'ATTENDANCE_OPERATOR', email: process.env.E2E_ATTENDANCE_OPERATOR_EMAIL, pw: process.env.E2E_PASSWORD });

const EXTRA = ['/mis', '/mis/orders', '/mis/bom', '/mis/po', '/mis/grn', '/mis/supplier-invoices', '/mis/production', '/mis/qc', '/mis/attendance', '/mis/payroll', '/mis/audit', '/mis/store', '/mis/inventory', '/mis/reports', '/mis/me'];
const MONEY = /₹|\bRs\.?\s?\d|wage|salary|payroll|\bbudget\b/i;

async function visit(page: Page, url: string, tag: string, errs: string[]) {
  const out: any = { url, tag };
  const before = errs.length;
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    out.status = resp?.status(); out.finalUrl = page.url();
    out.text = (await page.locator('body').innerText()).replace(/\n{2,}/g, '\n').slice(0, 7000);
    out.hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    out.moneyHits = [...new Set((out.text.match(new RegExp(MONEY, 'gi')) ?? []))];
    out.brandMarks = await page.locator('[data-testid="brand-mark"]:visible').count();
    out.factoryIcon = await page.locator('aside svg.lucide-factory, nav svg.lucide-factory, header svg.lucide-factory').count();
  } catch (e: any) { out.error = String(e.message).slice(0, 200); }
  out.newErrors = errs.slice(before);
  return out;
}

for (const c of creds) {
  test(`sweep ${c.role}`, async ({ browser }) => {
    const res: any = { role: c.role, pages: {} };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errs: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 200)}`); });
    page.on('pageerror', (e) => errs.push(`pageerror: ${String(e).slice(0, 200)}`));
    page.on('requestfailed', (r) => errs.push(`reqfailed: ${r.url().slice(0, 120)}`));
    page.on('response', (r) => { if (r.status() >= 400) errs.push(`http${r.status()}: ${r.url().slice(0, 120)}`); });

    await page.goto('/login');
    await page.locator('#email').fill(c.email);
    await page.locator('#password').fill(c.pw);
    await page.getByRole('button', { name: /sign in/i }).click();
    try { await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 }); res.login = 'ok'; }
    catch { res.login = 'FAIL'; writeFileSync(`e2e/golive/results/${c.role}.json`, JSON.stringify(res, null, 1)); await page.screenshot({ path: `e2e/golive/screenshots/${c.role}-login-fail.png` }); return; }

    errs.length = 0;
    const home = await visit(page, '/mis', 'desktop', errs);
    res.landing = home.finalUrl;
    res.sidebar = await page.locator('aside a[href^="/mis"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')))]);
    res.pages['/mis@desktop'] = home;
    await page.screenshot({ path: `e2e/golive/screenshots/${c.role}-home-desktop.png`, fullPage: true });

    const targets = [...new Set([...res.sidebar, ...EXTRA])].filter((u) => u !== '/mis').slice(0, 34);
    for (const u of targets) {
      const r = await visit(page, u, 'desktop', errs);
      res.pages[`${u}@desktop`] = r;
      const safe = u.replace(/[^a-z0-9]/gi, '_');
      if (['/mis/orders', '/mis/qc', '/mis/attendance', '/mis/payroll', '/mis/production', '/mis/audit', '/mis/po', '/mis/grn', '/mis/supplier-invoices', '/mis/bom'].includes(u)) await page.screenshot({ path: `e2e/golive/screenshots/${c.role}-${safe}-desktop.png`, fullPage: true });
    }
    for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }]] as const) {
      await page.setViewportSize(vp);
      for (const u of ['/mis', '/mis/attendance']) {
        const r = await visit(page, u, name, errs);
        res.pages[`${u}@${name}`] = r;
        if (u === '/mis') await page.screenshot({ path: `e2e/golive/screenshots/${c.role}-home-${name}.png`, fullPage: true });
      }
    }
    writeFileSync(`e2e/golive/results/${c.role}.json`, JSON.stringify(res, null, 1));
    await ctx.close();
  });
}
