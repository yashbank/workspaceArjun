import { test } from '@playwright/test';
test('probe combobox + owner orders', async ({ page }) => {
  test.setTimeout(400000);
  await page.goto('/login'); await page.locator('#email').fill(process.env.E2E_OWNER_EMAIL!); await page.locator('#password').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: /sign in/i }).click(); await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 });
  page.setDefaultTimeout(15000);
  const t0 = Date.now(); const r = await page.goto('/mis/orders', { waitUntil: 'networkidle', timeout: 120000 });
  console.log('PROBE orders', r?.status(), Date.now() - t0, 'ms', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth));
  await page.goto('/mis/attendance/leave', { waitUntil: 'networkidle', timeout: 120000 });
  const btns = await page.getByRole('button').allInnerTexts(); console.log('PROBE buttons', JSON.stringify(btns.slice(0, 25)));
  const nb = page.getByRole('button', { name: /new|add|request|apply/i }).first();
  if (await nb.count()) { await nb.click(); await page.waitForTimeout(500); }
  const cb = page.getByRole('combobox', { name: /employee/i }).first();
  console.log('PROBE combobox count', await cb.count());
  if (await cb.count()) { await cb.click(); await page.waitForTimeout(300); const n = await page.locator('[role="listbox"] [role="option"]:visible').count(); console.log('PROBE options', n);
    if (n) { try { await page.locator('[role="listbox"] [role="option"]:visible').first().click({ timeout: 8000 }); } catch (e) { console.log('PROBE optionclick FAIL', String(e).slice(0, 400)); } console.log('PROBE selected value', await cb.inputValue().catch(() => 'n/a')); }
    await page.screenshot({ path: 'e2e/golive/screenshots/r2-OWNER-combobox.png' }); }
  await page.goto('/mis/me/account', { waitUntil: 'networkidle' }); console.log('PROBE account', (await page.locator('main').first().innerText()).slice(0, 80).replace(/\n/g, '|'));
});
