// READ-ONLY live smoke. Opt-in: E2E_ALLOW_LIVE=1 E2E_BASE_URL=https://workspace-arjun.vercel.app
import { test, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = process.env.E2E_BASE_URL ?? '';
const LIVE = 'https://workspace-arjun.vercel.app';
if (process.env.E2E_ALLOW_LIVE !== '1' || BASE !== LIVE) throw new Error('live-smoke needs E2E_ALLOW_LIVE=1 and E2E_BASE_URL=' + LIVE);

const rows = readFileSync(`${homedir()}/golive-credentials/credentials-20261112.csv`, 'utf8').trim().split('\n').slice(1)
  .map((r) => { const [name, role, email, pw] = r.split(','); return { role, email, pw: pw?.trim() }; });
type Cred = { role: string; email: string; pw: string; pages: string[] };
const creds: Cred[] = [];
const E = process.env;
if (E.E2E_OWNER_EMAIL && E.E2E_PASSWORD) creds.push({ role: 'OWNER', email: E.E2E_OWNER_EMAIL, pw: E.E2E_PASSWORD, pages: ['/mis/orders', '/mis/production', '/mis/reports'] });
const P: Record<string, string[]> = {
  ADMIN: ['/mis/payroll', '/mis/employees', '/mis/attendance'],
  QC: ['/mis/qc', '/mis/production', '/mis/orders'],
  SUPERVISOR: ['/mis/production', '/mis/attendance', '/mis/orders'],
  STORE_GUY: ['/mis/store', '/mis/inventory', '/mis/grn'],
  SUPER_ATTENDANCE_OPERATOR: ['/mis/attendance', '/mis/me', '/mis/employees'],
};
for (const role of Object.keys(P)) { const r = rows.find((x) => x.role === role); if (r) creds.push({ role, email: r.email, pw: r.pw!, pages: P[role] }); }
if (E.E2E_ATTENDANCE_OPERATOR_EMAIL && E.E2E_PASSWORD) creds.push({ role: 'ATTENDANCE_OPERATOR', email: E.E2E_ATTENDANCE_OPERATOR_EMAIL, pw: E.E2E_PASSWORD, pages: ['/mis/attendance', '/mis/me', '/mis/orders'] });

mkdirSync('e2e/golive/results', { recursive: true });
let loads = 0;
const all: Record<string, Record<string, string>> = {};
const fails: string[] = [];

async function go(page: Page, url: string) { loads++; return page.goto(url, { waitUntil: 'load', timeout: 45000 }); }

for (const c of creds) {
  test(`live ${c.role}`, async ({ browser }) => {
    const R: Record<string, string> = (all[c.role] = {});
    const set = (k: string, ok: boolean, note = '') => { R[k] = ok ? 'PASS' : 'FAIL'; if (!ok) fails.push(`${c.role} | ${k} | ${note}`); };
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    let errs: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 160)}`); });
    page.on('pageerror', (e) => errs.push(`pageerror: ${String(e).slice(0, 160)}`));
    page.on('requestfailed', (r) => { if (!/_rsc|prefetch/.test(r.url()) || !/ERR_ABORTED/.test(r.failure()?.errorText ?? '')) errs.push(`reqfailed: ${r.url().slice(0, 100)} ${r.failure()?.errorText}`); });
    page.on('response', (r) => { if (r.status() >= 400) errs.push(`http${r.status()}: ${r.url().slice(0, 100)}`); });
    try {
      const lr = await go(page, '/login');
      await page.locator('#email').fill(c.email);
      await page.locator('#password').fill(c.pw);
      await page.getByRole('button', { name: /sign in/i }).click();
      let ok = true;
      try { await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 }); } catch { ok = false; }
      const body = ok ? '' : (await page.locator('body').innerText()).slice(0, 120).replace(/\s+/g, ' ');
      set('login', ok && (lr?.status() ?? 200) < 400, ok ? '' : `stayed on /login: ${body}`);
      if (!ok) return;
      await page.waitForLoadState('load');
      errs = [];
      // desktop home (load 1)
      const r = await go(page, '/mis');
      const st = r?.status() ?? 0;
      const txt = await page.locator('body').innerText();
      set('home desktop', st < 400 && !/404|could not be found/i.test(txt.slice(0, 300)), `${page.url()} status ${st}`);
      const brandD = await page.locator('aside [data-testid="brand-mark"]:visible').count();
      set('brand desktop', brandD > 0, `${page.url()} aside brand-mark count ${brandD}`);
      const nav = await page.locator('aside a[href^="/mis"]').count();
      set('nav items', nav > 0, `${page.url()} aside nav links ${nav}`);
      set('landing', true);
      R['landing'] = page.url().replace(BASE, '');
      // 3 role pages
      for (const u of c.pages) {
        const rr = await go(page, u);
        const t = await page.locator('body').innerText();
        const okp = (rr?.status() ?? 0) < 400 && !/404|could not be found|application error/i.test(t.slice(0, 400));
        const note = `${page.url()} status ${rr?.status()} final ${page.url().replace(BASE, '')}`;
        if (u === '/mis/payroll' && c.role === 'ADMIN') {
          const money = t.match(/₹|\bRs\.?\s?\d|wage|salary|\bgross\b|\bnet pay/gi);
          set('payroll no money', okp && !money, `${page.url()} found: ${[...new Set(money ?? [])].join(',')} | head: ${t.slice(0, 150).replace(/\s+/g, ' ')}`);
          R[u] = 'PASS'; continue;
        }
        if (u === '/mis/employees' && c.role === 'ADMIN') {
          await page.waitForTimeout(500);
          const codes = new Set((t.match(/EMP\d{3,}/g) ?? []).filter((x) => +x.slice(3) >= 101));
          const m = t.match(/(\d+)\s*(employees|results|total)/i);
          set('employees 149', okp && codes.size === 149, `${page.url()} distinct EMP101+ codes ${codes.size}; count-text ${m?.[0] ?? 'none'}`);
          R[u] = 'PASS'; continue;
        }
        set(`page ${u}`, okp, note + ` head: ${t.slice(0, 100).replace(/\s+/g, ' ')}`);
      }
      // second home load desktop done above; phone: 2 loads
      await page.setViewportSize({ width: 390, height: 844 });
      await go(page, '/mis');
      const brandP = await page.locator('header [data-testid="brand-mark"]:visible').count();
      set('brand phone', brandP > 0, `${page.url()} header brand-mark count ${brandP}`);
      const hs1 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await go(page, '/mis');
      const hs2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      set('no hscroll 390', hs1 <= 1 && hs2 <= 1, `${page.url()} overflow px ${hs1}/${hs2}`);
      await page.setViewportSize({ width: 1280, height: 800 });
      await go(page, '/mis');
      const un = [...new Set(errs)].filter((e) => !/\/login/.test(e));
      set('no console/req errors', un.length === 0, un.slice(0, 4).join(' ; '));
      if (c.role === 'ADMIN') {
        const rr = await go(page, '/mis/me/account');
        const t = await page.locator('body').innerText();
        set('/mis/me/account loads', (rr?.status() ?? 0) < 400 && !/404/.test(t.slice(0, 300)) && /password/i.test(t), `${page.url()} status ${rr?.status()}`);
      }
    } finally { await ctx.close(); }
  });
}

test.afterAll(() => {
  writeFileSync('e2e/golive/results/live-smoke.json', JSON.stringify({ loads, all, fails }, null, 1));
  console.log('PAGE_LOADS', loads);
});
