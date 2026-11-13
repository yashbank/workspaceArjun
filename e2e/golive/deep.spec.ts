// READ-ONLY deep dive: demo orders' QC + production pages, attendance month views, payroll. Navigation only.
import { test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
if (!BASE.startsWith('http://localhost')) throw new Error('localhost only');
const rows = readFileSync(`${homedir()}/golive-credentials/credentials-20261112.csv`, 'utf8').trim().split('\n').slice(1).map((r) => r.split(','));
const admin = rows.find((r) => r[1] === 'ADMIN')!;
const sao = rows.find((r) => r[1] === 'SUPER_ATTENDANCE_OPERATOR')!;
const who = [
  { role: 'OWNER', email: process.env.E2E_OWNER_EMAIL!, pw: process.env.E2E_PASSWORD! },
  { role: 'ADMIN', email: admin[2], pw: admin[3].trim() },
  { role: 'SUPER_ATTENDANCE_OPERATOR', email: sao[2], pw: sao[3].trim() },
];
for (const c of who) {
  test(`deep ${c.role}`, async ({ page }) => {
    const out: Record<string, string> = {};
    const grab = async (u: string) => { await page.goto(u, { waitUntil: 'networkidle' }); out[u] = (await page.locator('main').first().innerText().catch(() => page.locator('body').innerText())).replace(/\n{2,}/g, '\n').slice(0, 9000); };
    await page.goto('/login');
    await page.locator('#email').fill(c.email); await page.locator('#password').fill(c.pw);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
    for (const u of ['/mis/attendance?view=monthly&month=2026-11', '/mis/attendance?month=2026-11', '/mis/payroll', '/mis/audit', '/mis/employees']) await grab(u);
    if (c.role !== 'SUPER_ATTENDANCE_OPERATOR') {
      await page.goto('/mis/orders', { waitUntil: 'networkidle' });
      const ids = await page.locator('tr:has-text("[DEMO]") a[href^="/mis/orders/"]').evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!))]);
      out.demoOrderLinks = ids.join(',');
      for (const h of ids.slice(0, 3)) {
        const id = h.split('/').pop()!;
        for (const base of ['/mis/qc/', '/mis/production/', '/mis/orders/']) await grab(base + id);
      }
    }
    writeFileSync(`e2e/golive/results/deep-${c.role}.json`, JSON.stringify(out, null, 1));
  });
}
