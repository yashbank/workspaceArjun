import { test, expect, type Page } from '@playwright/test';

import { EXPECTED_NAV, hrefFor, storageStatePath } from './roles';

/**
 * ADMIN — every screen the role may open, on desktop and at phone width, plus the refusals it must
 * get, its two safe write paths (a customer, a QC template — both deactivated afterwards) and the
 * V2 UI contract from docs/qa/MIS_V2_TESTER_GUIDE.md as it reads for ADMIN.
 */
const ACCESS_DENIED = 'You do not have access to this';
const NOT_FOUND = 'This page does not exist';
const CRASH = 'Something went wrong';
const PHONE = { width: 390, height: 844 };

test.use({ storageState: storageStatePath('ADMIN') });

/** Direct routes: the sidebar, the phone-only "More" entries, the role home and every sub-page ADMIN holds. */
const ROUTES = [
  '/mis',
  '/mis/dashboard',
  ...EXPECTED_NAV.ADMIN.map(hrefFor),
  '/mis/crew',
  '/mis/attendance/leave',
  '/mis/settings/users',
  '/mis/me',
  '/mis/attendance/shifts',
  '/mis/attendance/extra-pay',
  '/mis/masters/departments',
  '/mis/masters/machines',
  '/mis/masters/processes',
  '/mis/masters/items',
  '/mis/masters/defect-types',
  '/mis/masters/GSM',
  '/mis/masters/SIZE',
  '/mis/masters/SUBSTRATE',
  '/mis/masters/COATING',
  '/mis/masters/COLOUR',
  '/mis/masters/UNIT',
  '/mis/masters/ITEM_TYPE',
  '/mis/qc/defects',
  '/mis/qc/grid',
  '/mis/settings/devices',
  '/mis/settings/qc-templates',
  '/mis/store/dashboard',
  '/mis/store/stock',
  '/mis/store/transactions',
  '/mis/store/receive',
  '/mis/store/issue',
  '/mis/store/count',
  '/mis/store/requests',
  '/mis/store/requests/new',
];

/** List → the href prefix of its row links; the first visible one is the detail page. */
const LISTS: { list: string; prefix: string }[] = [
  { list: '/mis/orders', prefix: '/mis/orders/' },
  { list: '/mis/production', prefix: '/mis/production/' },
  { list: '/mis/qc', prefix: '/mis/qc/' },
  { list: '/mis/machine-board', prefix: '/mis/machine-board/' },
  { list: '/mis/employees', prefix: '/mis/employees/' },
  { list: '/mis/po', prefix: '/mis/po/' },
  { list: '/mis/grn', prefix: '/mis/grn/' },
  { list: '/mis/inventory', prefix: '/mis/inventory/' },
  { list: '/mis/customers?view=classic', prefix: '/mis/customers/' },
  { list: '/mis/suppliers', prefix: '/mis/suppliers/' },
  { list: '/mis/bom', prefix: '/mis/bom/' },
  { list: '/mis/store/requests', prefix: '/mis/store/requests/' },
  { list: '/mis/store/stock', prefix: '/mis/store/ledger/' },
];

/** Print routes, reached from the detail page that links them. */
const PRINTS: { list: string; prefix: string; print: string; expectCopy?: string }[] = [
  { list: '/mis/orders', prefix: '/mis/orders/', print: '/mis/print/job-card/' },
  { list: '/mis/orders', prefix: '/mis/orders/', print: '/mis/print/coa/' },
  { list: '/mis/qc', prefix: '/mis/qc/', print: '/mis/print/qc-checklist/' },
  { list: '/mis/employees', prefix: '/mis/employees/', print: '/mis/print/badge/' },
  { list: '/mis/grn', prefix: '/mis/grn/', print: '/mis/print/grn/' },
  // A printed PO is priced; ADMIN is told so instead of handed blank money (print/po/[id]/page.tsx).
  { list: '/mis/po', prefix: '/mis/po/', print: '/mis/print/po/', expectCopy: 'prices are visible to the Owner only' },
];

const FORBIDDEN = [
  '/mis/payroll',
  '/mis/settings/wages',
  '/mis/settings/aql',
  '/mis/settings/rules',
  '/mis/print/payslip/00000000-0000-4000-8000-000000000000',
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function assertHealthy(page: Page, errors: string[], phone = false) {
  await expect(page.getByText(CRASH)).toHaveCount(0);
  await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  // MisShell renders the desktop and phone chromes in one DOM, so only what is on screen counts.
  await expect(page.locator('main:visible').first()).toContainText(/\S{3,}/);
  expect(errors, 'no uncaught browser errors').toEqual([]);
  if (phone) {
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(scroll, 'no horizontal overflow').toBeLessThanOrEqual(inner + 1);
  }
}

/** Opens the list and clicks its first visible row link; skips the test when the list is empty. */
async function openFirst(page: Page, list: string, prefix: string) {
  await page.goto(list);
  const row = page.locator(`a[href^="${prefix}"]:visible`).first();
  if ((await row.count()) === 0) test.skip(true, `no row on ${list}`);
  await row.click();
  await page.waitForURL(`**${prefix}**`);
}

for (const phone of [false, true]) {
  test.describe(phone ? 'phone 390x844' : 'desktop', () => {
    if (phone) test.use({ viewport: PHONE });

    for (const route of ROUTES) {
      test(`opens ${route}`, async ({ page }) => {
        const errors = watchErrors(page);
        await page.goto(route);
        await assertHealthy(page, errors, phone);
      });
    }

    for (const { list, prefix } of LISTS) {
      test(`opens the first detail of ${list}`, async ({ page }) => {
        const errors = watchErrors(page);
        await openFirst(page, list, prefix);
        await assertHealthy(page, errors, phone);
      });
    }

    for (const { list, prefix, print, expectCopy } of PRINTS) {
      test(`opens the print route ${print}`, async ({ page }) => {
        const errors = watchErrors(page);
        await openFirst(page, list, prefix);
        const link = page.locator(`a[href^="${print}"]`).first();
        if ((await link.count()) === 0) test.skip(true, `no ${print} link on this detail`);
        await page.goto((await link.getAttribute('href'))!);
        if (expectCopy) {
          await expect(page.getByText(expectCopy).filter({ visible: true }).first()).toBeVisible();
          await expect(page.getByText(CRASH)).toHaveCount(0);
          expect(errors).toEqual([]);
          return;
        }
        await assertHealthy(page, errors, phone);
      });
    }
  });
}

test.describe('refusals', () => {
  for (const route of FORBIDDEN) {
    test(`is refused calmly at ${route}`, async ({ page }) => {
      const errors = watchErrors(page);
      const res = await page.goto(route);
      expect(res?.status(), 'never a 500').toBeLessThan(500);
      await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
      await expect(page.getByText(CRASH)).toHaveCount(0);
      await expect(page.getByText(/Internal Server Error|at .+\.js:\d+/)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('writes', () => {
  test('customer: empty submit is blocked, E2E- customer is created then deactivated', async ({ page }) => {
    const code = `E2E-CUST-${Date.now()}`;
    await page.goto('/mis/customers?create=1');
    const form = page.getByRole('complementary', { name: 'Add' });
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: 'Save' }).click();
    // Native `required` validation holds the form on the page with the empty fields flagged.
    await expect(form.locator('input:invalid')).not.toHaveCount(0);
    expect(page.url()).toContain('create=1');

    await form.getByLabel('Code').fill(code);
    await form.getByLabel('Name · English').fill('E2E-customer');
    await form.getByRole('button', { name: 'Save' }).click();
    await page.waitForURL('**/mis/customers');
    await page.goto(`/mis/customers?q=${code}`);
    const row = page.locator('tr:visible', { hasText: code }).first();
    await expect(row).toBeVisible();

    await row.locator('a[href*="edit="]:visible').first().click();
    const edit = page.getByRole('complementary', { name: 'Edit' });
    await expect(edit.getByLabel('Code')).toHaveValue(code);
    await edit.getByRole('button', { name: 'Deactivate' }).click();
    await page.waitForURL('**deactivated=1**');
    await page.goto(`/mis/customers?q=${code}&deactivated=1`);
    await expect(page.locator('tr:visible', { hasText: code }).first().getByText('Deactivated')).toBeVisible();
  });

  test('QC template: no parameters is refused, E2E- template is created then deactivated', async ({ page }) => {
    const name = `E2E-template-${Date.now()}`;
    await page.goto('/mis/settings/qc-templates');
    await page.getByRole('button', { name: '+ New template' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('p.text-red-600')).toBeVisible();

    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.locator('textarea').fill('E2E parameter');
    await page.getByRole('button', { name: 'Save' }).click();
    const card = page.locator('div.rounded-xl', { hasText: name }).first();
    await expect(card).toBeVisible();
    await expect(card.getByText('E2E parameter')).toBeVisible();
    await card.getByRole('button', { name: 'Deactivate' }).click();
    await expect(card.getByText('Inactive')).toBeVisible();
  });
});

test.describe('V2 contract for ADMIN', () => {
  test('material requests list and form open', async ({ page }) => {
    await page.goto('/mis/store/requests');
    await expect(page.getByText('Material requests').first()).toBeVisible();
    await page.goto('/mis/store/requests/new');
    await expect(page.getByText('Request material').first()).toBeVisible();
  });

  test('GRN paperwork form has the invoice fields and never the amount (§3.1/3.2)', async ({ page }) => {
    await openFirst(page, '/mis/grn', '/mis/grn/');
    if ((await page.getByText('Delivery paperwork').count()) === 0) test.skip(true, 'first GRN is confirmed — no form');
    await expect(page.getByLabel(/Supplier Invoice No/)).toBeVisible();
    await expect(page.getByLabel(/Supplier Invoice Amount/)).toHaveCount(0);
  });

  test('3-way match on the PO shows quantities, no rupee tiles (§3.7)', async ({ page }) => {
    await openFirst(page, '/mis/po', '/mis/po/');
    if ((await page.getByText('3-way match').count()) === 0) test.skip(true, 'this PO has no GRN yet');
    await expect(page.getByText('PO value')).toHaveCount(0);
  });

  test('order BOM tab renders (allocation card only when stock is earmarked) (§2.2)', async ({ page }) => {
    const errors = watchErrors(page);
    await openFirst(page, '/mis/orders', '/mis/orders/');
    const bom = page.getByRole('tab', { name: /BOM/ }).or(page.getByRole('button', { name: /^BOM/ })).first();
    if ((await bom.count()) > 0) await bom.click();
    await expect(page.getByText(CRASH)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('QC checklist templates: the four paper forms with 10 slots (§5.1)', async ({ page }) => {
    await page.goto('/mis/settings/qc-templates');
    await expect(page.getByRole('heading', { name: 'QC checklist templates' })).toBeVisible();
    if ((await page.getByText('No templates yet').count()) > 0) test.skip(true, 'templates not seeded');
    for (const form of ['Printing 6-Colours', 'Lamination', 'Lamif Flute', 'Die Cutting']) {
      await expect(page.getByText(form, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/10 slots 09:15–18:00/).first()).toBeVisible();
  });

  test('notification bell opens and the feed answers 200 (§4.2)', async ({ page }) => {
    await page.goto('/mis');
    await page.getByRole('button', { name: /^Notifications/ }).first().click();
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Notifications' }).getByText('₹')).toHaveCount(0);
    expect((await page.request.get('/api/mis/notifications')).status()).toBe(200);
  });

  test('employee profile offers the photo picker (§6.1)', async ({ page }) => {
    await openFirst(page, '/mis/employees', '/mis/employees/');
    await expect(page.getByText(/Take photo|Retake photo/).filter({ visible: true })).toHaveCount(1);
  });
});
