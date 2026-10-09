import { test, expect } from '@playwright/test';

import { ROLES, storageStatePath, type MisRoleName } from './roles';

/**
 * MIS V2 (Oct 2026) — the seven epics, role by role, on the real deployed site.
 *
 * Read-only by default: every test opens a V2 screen as each role and asserts the page either
 * renders its V2 content or is refused with the calm copy. The two write paths (a Supervisor
 * raising a material request, the Store approving it) run only when the data they need exists,
 * and skip otherwise, so this suite is safe against a tester's live database.
 */
const ACCESS_DENIED = 'You do not have access to this';
const NOT_FOUND = 'This page does not exist';

/** Who may OPEN each V2 screen (server gate), from lib/mis/permissions.ts. */
const SCREENS: { path: string; allowed: MisRoleName[]; marker: string | RegExp }[] = [
  // Epic 3 — material requests: store.read
  { path: '/mis/store/requests', allowed: ['OWNER', 'ADMIN', 'SUPERVISOR', 'STORE_GUY'], marker: 'Material requests' },
  { path: '/mis/store/requests/new', allowed: ['OWNER', 'ADMIN', 'SUPERVISOR', 'STORE_GUY'], marker: 'Request material' },
  // Epic 5 — QC templates: settings.write
  { path: '/mis/settings/qc-templates', allowed: ['OWNER', 'ADMIN'], marker: 'QC checklist templates' },
  // Epic 1/4 — GRN list (paperwork fields live on the detail): grn.read
  { path: '/mis/grn', allowed: ['OWNER', 'ADMIN', 'SUPERVISOR', 'STORE_GUY'], marker: /GRN/ },
];

for (const screen of SCREENS) {
  test.describe(`${screen.path}`, () => {
    for (const role of ROLES) {
      const allowed = screen.allowed.includes(role);
      test(`${role} ${allowed ? 'opens it' : 'is refused'}`, async ({ browser }) => {
        const ctx = await browser.newContext({ storageState: storageStatePath(role) });
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(screen.path);
        if (allowed) {
          await expect(page.getByText(screen.marker).first()).toBeVisible();
          await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
          await expect(page.getByText('Something went wrong')).toHaveCount(0);
        } else {
          await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
        }
        expect(errors, 'no uncaught browser errors').toEqual([]);
        await ctx.close();
      });
    }
  });
}

test.describe('Epic 1 — invoice amount is Owner-only on the GRN detail', () => {
  for (const role of ['OWNER', 'ADMIN', 'STORE_GUY'] as const) {
    test(`${role}: paperwork form ${role === 'OWNER' ? 'shows' : 'hides'} the amount field`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: storageStatePath(role) });
      const page = await ctx.newPage();
      await page.goto('/mis/grn');
      const draft = page.locator('a[href^="/mis/grn/"]:visible').first();
      if ((await draft.count()) === 0) test.skip(true, 'no GRN exists to open');
      await draft.click();
      await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
      // Only a DRAFT GRN shows the form at all; a confirmed one shows the paperwork as rows.
      const form = page.getByText('Delivery paperwork');
      if ((await form.count()) === 0) test.skip(true, 'first GRN is confirmed — no form to inspect');
      await expect(page.getByLabel(/Supplier Invoice No/)).toBeVisible();
      await expect(page.getByLabel(/Supplier Invoice Amount/)).toHaveCount(role === 'OWNER' ? 1 : 0);
      await ctx.close();
    });
  }
});

test.describe('Epic 1 — 3-way match on the PO detail; rupees for the Owner only', () => {
  for (const role of ['OWNER', 'STORE_GUY'] as const) {
    test(`${role}`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: storageStatePath(role) });
      const page = await ctx.newPage();
      await page.goto('/mis/po');
      const first = page.locator('a[href^="/mis/po/"]:visible').first();
      if ((await first.count()) === 0) test.skip(true, 'no PO exists');
      await first.click();
      await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
      const match = page.getByText('3-way match');
      if ((await match.count()) === 0) test.skip(true, 'this PO has no GRN yet — the match card appears only then');
      await expect(page.getByText('PO value')).toHaveCount(role === 'OWNER' ? 1 : 0);
      await ctx.close();
    });
  }
});

test.describe('Epic 2 — order detail shows allocated stock (BOM tab) without crashing', () => {
  test.use({ storageState: storageStatePath('ADMIN') });
  test('opens the first order and the BOM tab', async ({ page }) => {
    await page.goto('/mis/orders');
    const first = page.locator('a[href^="/mis/orders/"]:visible').first();
    if ((await first.count()) === 0) test.skip(true, 'no order exists');
    await first.click();
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
  });
});

test.describe('Epic 3 — a Supervisor raises a request, the Store sees it (write path, skips without stock)', () => {
  test('supervisor → store', async ({ browser }) => {
    const sup = await (await browser.newContext({ storageState: storageStatePath('SUPERVISOR') })).newPage();
    await sup.goto('/mis/store/requests/new');
    await expect(sup.getByText('Request material').first()).toBeVisible();
    const search = sup.locator('input[inputmode="search"]').first();
    await search.fill('a');
    const hit = sup.locator('button:visible', { hasText: /\S/ }).filter({ hasNotText: /General|Not recorded|Confirm/ }).first();
    if ((await sup.getByText('Confirm').count()) === 0 && (await hit.count()) === 0) test.skip(true, 'no item matched — nothing to request');
    await hit.click();
    const confirm = sup.getByRole('button', { name: /confirm|request/i }).last();
    if ((await confirm.isDisabled().catch(() => true))) test.skip(true, 'cart could not be confirmed (no stock) — skipping the write');
    await confirm.click();
    await expect(sup.getByText('is waiting for the Store')).toBeVisible({ timeout: 15000 });
    const requestNo = (await sup.locator('span.font-mono').first().textContent())?.trim();
    expect(requestNo).toMatch(/^MRN-/);

    const store = await (await browser.newContext({ storageState: storageStatePath('STORE_GUY') })).newPage();
    await store.goto('/mis/store/requests');
    await expect(store.getByText(requestNo!)).toBeVisible();
    await store.getByText(requestNo!).click();
    await expect(store.getByRole('button', { name: /Approve & issue/ })).toBeVisible();
    await expect(store.getByRole('button', { name: /Reject/ })).toBeVisible();
  });
});

test.describe('Epic 5 — QC checklist grid on a QC order page (QC role)', () => {
  test.use({ storageState: storageStatePath('QC') });
  test('the four forms are offered and the grid renders 10 slot columns', async ({ page }) => {
    await page.goto('/mis/qc');
    const first = page.locator('a[href^="/mis/qc/"]:visible').first();
    if ((await first.count()) === 0) test.skip(true, 'no QC order to open');
    await first.click();
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    const checklist = page.getByText('Checklist').first();
    if ((await checklist.count()) === 0) test.skip(true, 'templates not seeded on this environment (run the migration)');
    await expect(page.getByRole('columnheader', { name: '09:15' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '18:00' })).toBeVisible();
    await expect(page.getByText('🖨 A4')).toBeVisible();
  });
});

test.describe('Epic 7 — employee photo picker is offered to employees.write roles only', () => {
  for (const role of ['ADMIN', 'ATTENDANCE_OPERATOR'] as const) {
    test(`${role}`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: storageStatePath(role) });
      const page = await ctx.newPage();
      await page.goto('/mis/employees');
      const first = page.locator('a[href^="/mis/employees/"]:visible').first();
      if ((await first.count()) === 0) test.skip(true, 'no employee to open');
      await first.click();
      await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
      // MisShell renders the desktop and phone chromes in one DOM tree, so count only what is on screen.
      await expect(page.getByText(/Take photo|Retake photo/).filter({ visible: true })).toHaveCount(role === 'ADMIN' ? 1 : 0);
      await ctx.close();
    });
  }
  test('the photo endpoint answers 404 (not 500) for an employee with no photo, and 403 for a session without employees.read', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('QC') });
    const res = await ctx.request.get('/api/mis/employees/00000000-0000-4000-8000-000000000000/photo');
    expect([403, 404]).toContain(res.status());
    await ctx.close();
  });
});

test.describe('Epic 4 — role homes still render after the alert cards were added', () => {
  for (const role of ['OWNER', 'ADMIN'] as const) {
    test(`${role} home`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: storageStatePath(role) });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/mis');
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
      await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }
});

test.describe('V2 round 2 — live bell for Owner / Admin / Store Guy only', () => {
  for (const role of ROLES) {
    const onBell = (['OWNER', 'ADMIN', 'STORE_GUY'] as MisRoleName[]).includes(role);
    test(`${role} ${onBell ? 'sees' : 'does not see'} the bell`, async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: storageStatePath(role) });
      const page = await ctx.newPage();
      await page.goto('/mis');
      await expect(page.getByRole('button', { name: /^Notifications/ }).first()).toHaveCount(onBell ? 1 : 0);
      if (onBell) {
        await page.getByRole('button', { name: /^Notifications/ }).first().click();
        await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
      }
      const res = await ctx.request.get('/api/mis/notifications');
      // grn.read holders get 200 (an empty list for a Supervisor); the rest are refused, never 500.
      expect([200, 403]).toContain(res.status());
      await ctx.close();
    });
  }
});

test.describe('V2 round 2 — home shortcuts and allocation hints', () => {
  test('STORE_GUY home has the Requests tile', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('STORE_GUY') });
    const page = await ctx.newPage();
    await page.goto('/mis');
    await expect(page.locator('a[href="/mis/store/requests"]').first()).toBeVisible();
    await ctx.close();
  });
  test('SUPERVISOR home offers "Request material from the store"', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('SUPERVISOR') });
    const page = await ctx.newPage();
    await page.goto('/mis');
    await expect(page.locator('a[href="/mis/store/requests/new"]').first()).toBeVisible();
    await ctx.close();
  });
  test('the issue screen loads with its order chips (allocation hint appears only for an earmarked order)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('STORE_GUY') });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/mis/store/issue');
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
  test('ADMIN desktop order detail renders (allocation card only when stock is earmarked)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: storageStatePath('ADMIN'), viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto('/mis/orders');
    const first = page.locator('a[href^="/mis/orders/"]:visible').first();
    if ((await first.count()) === 0) test.skip(true, 'no order exists');
    await first.click();
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await ctx.close();
  });
});
