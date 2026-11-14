import { test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
test('probe sup phone', async ({ browser }) => {
  test.setTimeout(300000);
  const r = readFileSync(`${homedir()}/golive-credentials/credentials-20261112.csv`, 'utf8').trim().split('\n').slice(1).map((x) => x.split(',')).find((x) => x[1] === 'SUPERVISOR')!;
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await page.goto('/login'); await page.locator('#email').fill(r[2]); await page.locator('#password').fill(r[3].trim());
  await page.getByRole('button', { name: /sign in/i }).click(); await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  for (const u of ['/mis', '/mis/orders']) {
    await page.goto(u, { waitUntil: 'networkidle' });
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, wide: [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map((e) => e.tagName + '.' + String(e.className).slice(0, 80) + ' r=' + Math.round(e.getBoundingClientRect().right)) }));
    console.log('PROBE', u, JSON.stringify(o));
  }
});
