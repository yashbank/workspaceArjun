import { test as setup, expect } from '@playwright/test';

import { ROLES, credentialsFor, storageStatePath } from './roles';

for (const role of ROLES) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    const { email, password } = credentialsFor(role);

    await page.goto('/login');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    // The form does a full navigation on success (`window.location.href = next`); failure keeps
    // us on /login with an inline error instead.
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });

    await page.goto('/mis');
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('text=This page does not exist')).toHaveCount(0);

    await page.context().storageState({ path: storageStatePath(role) });
  });
}
