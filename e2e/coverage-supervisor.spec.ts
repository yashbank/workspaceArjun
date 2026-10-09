import { test, expect, type Page } from '@playwright/test';

import { EXPECTED_NAV, hrefFor, storageStatePath } from './roles';

/**
 * SUPERVISOR — full-screen coverage on the live site (read-mostly).
 *
 * Every route the role may open is visited at desktop and phone width and checked for the three
 * calm-failure copies, uncaught browser errors and (on the phone) horizontal overflow. Five routes
 * the role must NOT open are checked for the refusal copy. The one write is the role's own safe
 * action, a material request (an ask the Store decides on; nothing leaves the ledger).
 */
const ACCESS_DENIED = 'You do not have access to this';
const NOT_FOUND = 'This page does not exist';
const CRASH = 'Something went wrong';
const PHONE = { width: 390, height: 844 };

test.use({ storageState: storageStatePath('SUPERVISOR') });

/** Static routes: EXPECTED_NAV, phone-only entries, the role home, the dashboard and every sub-list. */
const STATIC_ROUTES = [
  '/mis',
  '/mis/dashboard',
  ...EXPECTED_NAV.SUPERVISOR.map(hrefFor),
  '/mis/crew',
  '/mis/attendance/leave',
  '/mis/attendance/shifts',
  '/mis/me',
  ...['GSM', 'SIZE', 'SUBSTRATE', 'COATING', 'COLOUR', 'UNIT', 'ITEM_TYPE'].map((g) => `/mis/masters/${g}`),
  '/mis/masters/items',
  '/mis/masters/machines',
  '/mis/masters/processes',
  '/mis/masters/departments',
  '/mis/masters/defect-types',
  '/mis/qc/defects',
  '/mis/qc/grid',
  '/mis/store/dashboard',
  '/mis/store/stock',
  '/mis/store/transactions',
  '/mis/store/issue',
  '/mis/store/receive',
  '/mis/store/requests',
  '/mis/store/requests/new',
];

/** List page → the href prefix of its row links (the first visible one is the detail we open). */
const DETAIL_LISTS: { list: string; prefix: string }[] = [
  { list: '/mis/orders', prefix: '/mis/orders/' },
  { list: '/mis/production', prefix: '/mis/production/' },
  { list: '/mis/qc', prefix: '/mis/qc/' },
  { list: '/mis/machine-board', prefix: '/mis/machine-board/' },
  { list: '/mis/employees', prefix: '/mis/employees/' },
  { list: '/mis/grn', prefix: '/mis/grn/' },
  { list: '/mis/inventory', prefix: '/mis/inventory/' },
  { list: '/mis/customers', prefix: '/mis/customers/' },
  { list: '/mis/bom', prefix: '/mis/bom/' },
  { list: '/mis/store', prefix: '/mis/store/ledger/' },
  { list: '/mis/store/requests', prefix: '/mis/store/requests/' },
  { list: '/mis', prefix: '/mis/production/sign-off/' },
];

/** Print route → where to find an id for it (first visible row link on that list). */
const PRINT_ROUTES: { print: string; list: string; prefix: string; may404?: string }[] = [
  { print: '/mis/print/job-card/', list: '/mis/orders', prefix: '/mis/orders/' },
  { print: '/mis/print/coa/', list: '/mis/orders', prefix: '/mis/orders/' },
  { print: '/mis/print/qc-checklist/', list: '/mis/orders', prefix: '/mis/orders/', may404: 'no active QC template on this environment' },
  { print: '/mis/print/grn/', list: '/mis/grn', prefix: '/mis/grn/' },
  { print: '/mis/print/badge/', list: '/mis/employees', prefix: '/mis/employees/' },
];

/** From permissions.ts: no approvals.read, settings.read, po.read, wages.read, store.count, attendance.write, queue.review. */
const REFUSED_ROUTES = [
  '/mis/approvals',
  '/mis/settings',
  '/mis/po',
  '/mis/suppliers',
  '/mis/payroll',
  '/mis/audit',
  '/mis/queue',
  '/mis/kiosk',
  '/mis/settings/qc-templates',
  '/mis/settings/rules',
  '/mis/store/count',
  '/mis/attendance/extra-pay',
];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function assertHealthy(page: Page, errors: string[], phone: boolean) {
  await expect(page.getByText(CRASH)).toHaveCount(0);
  await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  // A heading or table, or (the badge print and the phone BOM have neither) a card or a line of copy.
  await expect(page.locator('h1, h2, h3, table, main [class*="rounded"], p').filter({ visible: true }).first(), 'some real content rendered').toBeVisible();
  expect(errors, 'no uncaught browser errors').toEqual([]);
  if (phone) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no horizontal overflow at 390px').toBeLessThanOrEqual(1);
  }
}

/**
 * Opens `list` and returns the first row link under `prefix` whose id is a UUID (every detail page
 * is `isUuid`-gated, and `/mis/qc/grid` or `/mis/store/requests/new` share a prefix with a detail),
 * or skips the test. Hidden links count too: a desktop table may carry no link while the phone card
 * list, rendered hidden in the same DOM, does, and the href is only used to navigate.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function firstDetailHref(page: Page, list: string, prefix: string): Promise<string> {
  await page.goto(list);
  const hrefs = await page.locator(`a[href^="${prefix}"]`).evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
  const href = hrefs.find((h) => UUID.test(h.slice(prefix.length).split(/[/?#]/)[0]));
  if (!href) test.skip(true, `no row on ${list} to open`);
  return href!;
}

for (const phone of [false, true]) {
  test.describe(phone ? 'phone 390x844' : 'desktop 1280x800', () => {
    if (phone) test.use({ viewport: PHONE });

    for (const route of STATIC_ROUTES) {
      test(`opens ${route}`, async ({ page }) => {
        const errors = trackErrors(page);
        await page.goto(route);
        await assertHealthy(page, errors, phone);
      });
    }

    for (const { list, prefix } of DETAIL_LISTS) {
      test(`opens the first detail of ${list} (${prefix}*)`, async ({ page }) => {
        const errors = trackErrors(page);
        const href = await firstDetailHref(page, list, prefix);
        await page.goto(href);
        await assertHealthy(page, errors, phone);
      });
    }

    for (const { print, list, prefix, may404 } of PRINT_ROUTES) {
      test(`opens the print route ${print}*`, async ({ page }) => {
        const errors = trackErrors(page);
        const href = await firstDetailHref(page, list, prefix);
        const id = href.slice(prefix.length).split(/[/?#]/)[0];
        await page.goto(print + id);
        if (may404 && (await page.getByText(NOT_FOUND).count()) > 0) test.skip(true, may404);
        await assertHealthy(page, errors, phone);
      });
    }
  });
}

test.describe('refused routes answer with the calm copy, never a 500', () => {
  for (const route of REFUSED_ROUTES) {
    test(`is refused on ${route}`, async ({ page }) => {
      const errors = trackErrors(page);
      const res = await page.goto(route);
      expect(res?.status() ?? 0, 'no server error').toBeLessThan(500);
      await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
      await expect(page.getByText(CRASH)).toHaveCount(0);
      await expect(page.locator('table')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('write — material request (the Supervisor asks, the Store decides)', () => {
  test('empty cart cannot be sent; one line sends and the MRN appears on the list', async ({ page }) => {
    await page.goto('/mis/store/requests/new');
    await expect(page.getByText('Request material').first()).toBeVisible();
    const send = page.getByRole('button', { name: 'Send request' });
    // Validation on an empty cart: the hint stays and the button is disabled.
    await expect(page.getByText('Add everything going to the floor, then confirm once.').first()).toBeVisible();
    await expect(send).toBeDisabled();
    await send.click({ force: true });
    await expect(page.getByText('is waiting for the Store')).toHaveCount(0);

    await page.getByLabel('Scan or search an item').locator('visible=true').first().fill('a');
    const hit = page.locator('button:visible', { hasText: 'Add' }).first();
    if ((await hit.count()) === 0) test.skip(true, 'no store item matched — nothing to request');
    await hit.click();
    await expect(send).toBeEnabled();
    await send.click();
    await expect(page.getByText('is waiting for the Store')).toBeVisible({ timeout: 15000 });
    const requestNo = (await page.locator('span.font-mono').first().textContent())?.trim();
    expect(requestNo).toMatch(/^MRN-/);
    test.info().annotations.push({ type: 'created', description: `MaterialRequest ${requestNo}` });

    await page.getByRole('link', { name: 'Open request' }).click();
    await expect(page.getByText(requestNo!).first()).toBeVisible();
    // store.write only: a Supervisor never decides their own request.
    await expect(page.getByRole('button', { name: /Approve & issue/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Reject/ })).toHaveCount(0);

    await page.goto('/mis/store/requests');
    await expect(page.getByText(requestNo!).first()).toBeVisible();
  });
});

test.describe('V2 contract for the Supervisor (docs/qa/MIS_V2_TESTER_GUIDE.md)', () => {
  test('§1.1 home offers "Request material from the store"', async ({ page }) => {
    await page.goto('/mis');
    await expect(page.locator('a[href="/mis/store/requests/new"]').first()).toBeVisible();
    await expect(page.locator('a[href="/mis/production"]').first()).toBeVisible();
  });

  test('§4.5 no bell in the top bar; the notifications API never 500s', async ({ page }) => {
    await page.goto('/mis');
    await expect(page.getByRole('button', { name: /^Notifications/ })).toHaveCount(0);
    const res = await page.request.get('/api/mis/notifications');
    expect([200, 403]).toContain(res.status());
  });

  test('§3 GRN detail is read-only: no "Delivery paperwork" form, never the invoice amount', async ({ page }) => {
    const href = await firstDetailHref(page, '/mis/grn', '/mis/grn/');
    await page.goto(href);
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    await expect(page.getByText('Delivery paperwork')).toHaveCount(0);
    await expect(page.getByLabel(/Supplier Invoice Amount/)).toHaveCount(0);
    await expect(page.getByText(/Supplier Invoice Amount|₹/)).toHaveCount(0);
  });

  test('§3.6 the PO detail (3-way match) is not reachable without po.read', async ({ page }) => {
    await page.goto('/mis/po');
    await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
  });

  test('§2 order detail renders the BOM tab (allocation card only when stock is earmarked)', async ({ page }) => {
    const href = await firstDetailHref(page, '/mis/orders', '/mis/orders/');
    await page.goto(href);
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    // Phone: a BOM tab to tap. Desktop: the bill of materials is a card on the page already.
    const tab = page.getByRole('button', { name: 'BOM', exact: true }).filter({ visible: true });
    if ((await tab.count()) > 0) await tab.first().click();
    await expect(page.getByText(/BOM|Bill of materials/i).first()).toBeVisible();
    await expect(page.getByText(CRASH)).toHaveCount(0);
  });

  test('§5 QC checklist on an order is view-only: no Pass/Fail buttons for qc.read', async ({ page }) => {
    const href = await firstDetailHref(page, '/mis/qc', '/mis/qc/');
    await page.goto(href);
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    if ((await page.getByText('Checklist').count()) === 0) test.skip(true, 'templates not seeded on this environment');
    await expect(page.getByRole('button', { name: /^(Pass|Fail|Make Ready|Plate Err)$/ })).toHaveCount(0);
  });

  test('§5.8 QC templates settings page is refused', async ({ page }) => {
    await page.goto('/mis/settings/qc-templates');
    await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
  });

  test('§6.5 employee profile offers no photo picker (employees.read only)', async ({ page }) => {
    const href = await firstDetailHref(page, '/mis/employees', '/mis/employees/');
    await page.goto(href);
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    await expect(page.getByText(/Take photo|Retake photo/).filter({ visible: true })).toHaveCount(0);
  });

  test('§1.9 material requests list shows no approve/reject for a Supervisor', async ({ page }) => {
    await page.goto('/mis/store/requests');
    await expect(page.getByText('Material requests').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Approve & issue/ })).toHaveCount(0);
  });
});
