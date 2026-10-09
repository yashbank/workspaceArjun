import { test, expect, type Locator, type Page } from '@playwright/test';

import { EXPECTED_NAV, hrefFor, storageStatePath } from './roles';

/**
 * STORE_GUY — full-screen coverage on the live site (read-mostly).
 *
 * Every route the role may open is visited at desktop and phone width and checked for the three
 * calm-failure copies, uncaught browser errors and (on the phone) horizontal overflow. Routes the
 * role must NOT open are checked for the refusal copy. The one write is the role's own safe
 * action, a material request it then rejects itself (nothing leaves the ledger, the MRN ends
 * REJECTED). No GRN is created: a draft GRN has no delete, so it would linger on the live list.
 */
const ACCESS_DENIED = 'You do not have access to this';
const NOT_FOUND = 'This page does not exist';
const CRASH = 'Something went wrong';
const PHONE = { width: 390, height: 844 };

test.use({ storageState: storageStatePath('STORE_GUY') });

/** EXPECTED_NAV, the phone bottom-bar tabs (Stock / Receive / Issue / Me — no "More" tab for this role), the home, the dashboard and every store sub-page. */
const STATIC_ROUTES = [
  '/mis',
  '/mis/dashboard',
  '/mis/me',
  ...EXPECTED_NAV.STORE_GUY.map(hrefFor),
  '/mis/store/dashboard',
  '/mis/store/stock',
  '/mis/store/transactions',
  '/mis/store/issue',
  '/mis/store/receive',
  '/mis/store/count',
  '/mis/store/requests',
  '/mis/store/requests/new',
];

/** List page → the href prefix of its row links (the first visible one is the detail we open). */
const DETAIL_LISTS: { list: string; prefix: string }[] = [
  { list: '/mis/po', prefix: '/mis/po/' },
  { list: '/mis/grn', prefix: '/mis/grn/' },
  { list: '/mis/inventory', prefix: '/mis/inventory/' },
  { list: '/mis/suppliers', prefix: '/mis/suppliers/' },
  { list: '/mis/store', prefix: '/mis/store/ledger/' },
  { list: '/mis/store/stock', prefix: '/mis/store/ledger/' },
  { list: '/mis/store/requests', prefix: '/mis/store/requests/' },
];

/** From permissions.ts: no orders/masters/qc/attendance/employees/settings/approvals/wages/queue. */
const REFUSED_ROUTES = [
  '/mis/orders',
  '/mis/masters',
  '/mis/qc',
  '/mis/attendance',
  '/mis/employees',
  '/mis/settings',
  '/mis/settings/qc-templates',
  '/mis/settings/rules',
  '/mis/approvals',
  '/mis/payroll',
  '/mis/queue',
  '/mis/audit',
  '/mis/customers',
  '/mis/kiosk',
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
  await expect(page.locator('h1, h2, h3, table').filter({ visible: true }).first(), 'some real content rendered').toBeVisible();
  expect(errors, 'no uncaught browser errors').toEqual([]);
  if (phone) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no horizontal overflow at 390px').toBeLessThanOrEqual(1);
  }
}

/** Opens `list` and returns the first visible row link matching `prefix`, or skips the test. */
async function firstDetailHref(page: Page, list: string, prefix: string): Promise<string> {
  await page.goto(list);
  const link = page.locator(`a[href^="${prefix}"]:visible`).first();
  // Rows stream in after the shell; give them a moment before deciding the list is empty.
  await link.waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);
  if ((await link.count()) === 0) test.skip(true, `no row on ${list} to open`);
  const href = await link.getAttribute('href');
  if (!href) test.skip(true, `row on ${list} has no href`);
  return href!;
}

const idFrom = (href: string, prefix: string) => href.slice(prefix.length).split(/[/?#]/)[0];

/** MisShell renders the desktop and phone chromes in one DOM tree, so match only what is on screen. */
const vis = (l: Locator) => l.filter({ visible: true }).first();

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

    test('opens the print route /mis/print/grn/*', async ({ page }) => {
      const errors = trackErrors(page);
      const id = idFrom(await firstDetailHref(page, '/mis/grn', '/mis/grn/'), '/mis/grn/');
      await page.goto(`/mis/print/grn/${id}`);
      await assertHealthy(page, errors, phone);
    });

    test('opens the print route /mis/print/po/* (priced: told it is Owner-only, never a crash)', async ({ page }) => {
      const errors = trackErrors(page);
      const id = idFrom(await firstDetailHref(page, '/mis/po', '/mis/po/'), '/mis/po/');
      const res = await page.goto(`/mis/print/po/${id}`);
      expect(res?.status() ?? 0).toBeLessThan(500);
      await expect(vis(page.getByText('prices are visible to the Owner only'))).toBeVisible();
      await expect(page.getByText(CRASH)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
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
      await expect(page.getByText(/at .+\.(js|tsx?):\d+/)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('write — material request raised and then rejected by the Store itself', () => {
  test('empty cart cannot be sent; one line sends; empty reject note is refused; E2E- note rejects it (tidy-up)', async ({ page }) => {
    await page.goto('/mis/store/requests/new');
    await expect(vis(page.getByText('Request material'))).toBeVisible();
    const send = vis(page.getByRole('button', { name: 'Send request' }));
    await expect(vis(page.getByText('Add everything going to the floor, then confirm once.'))).toBeVisible();
    await expect(send).toBeDisabled();
    await send.click({ force: true });
    await expect(page.getByText('is waiting for the Store')).toHaveCount(0);

    await vis(page.getByLabel('Scan or search an item')).fill('a');
    const hit = page.locator('button:visible', { hasText: 'Add' }).first();
    if ((await hit.count()) === 0) test.skip(true, 'no store item matched — nothing to request');
    await hit.click();
    await expect(send).toBeEnabled();
    await send.click();
    await expect(vis(page.getByText('is waiting for the Store'))).toBeVisible({ timeout: 15000 });
    const requestNo = (await vis(page.locator('span.font-mono')).textContent())?.trim();
    expect(requestNo).toMatch(/^MRN-/);
    test.info().annotations.push({ type: 'created', description: `MaterialRequest ${requestNo}` });

    await vis(page.getByRole('link', { name: 'Open request' })).click();
    await expect(vis(page.getByText(requestNo!))).toBeVisible();
    await expect(vis(page.getByText('PENDING'))).toBeVisible();

    // §1.5: more than requested → inline error and Approve disabled (nothing is written).
    const qty = vis(page.getByLabel(/^Issue qty \(max \d+\)/));
    const max = Number((await qty.getAttribute('max')) ?? '0');
    await qty.fill(String(max + 1));
    await expect(vis(page.getByText(`Cannot issue more than ${max}`))).toBeVisible();
    await expect(vis(page.getByRole('button', { name: 'Approve & issue' }))).toBeDisabled();
    await qty.fill(String(max));

    // §1.8: reject without a note is refused with the exact copy.
    const reject = vis(page.getByRole('button', { name: 'Reject', exact: true }));
    await reject.click();
    await expect(vis(page.getByText('Give a reason to reject.'))).toBeVisible();

    await vis(page.getByLabel('Note (required to reject)')).fill('E2E-reject automated coverage run');
    await reject.click();
    await expect(vis(page.getByText('REJECTED'))).toBeVisible({ timeout: 15000 });
    // §1.7: a decided request offers no buttons.
    await expect(page.getByRole('button', { name: 'Approve & issue' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
    await expect(vis(page.getByText('E2E-reject automated coverage run'))).toBeVisible();

    await page.goto('/mis/store/requests');
    await expect(vis(page.getByText(requestNo!))).toBeVisible();
  });
});

test.describe('V2 contract for the Store Guy (docs/qa/MIS_V2_TESTER_GUIDE.md)', () => {
  test('§1.4 home has the Requests tile, Receive / Issue / Count shortcuts and the store sections', async ({ page }) => {
    await page.goto('/mis');
    for (const href of ['/mis/store/requests', '/mis/store/receive', '/mis/store/issue', '/mis/store/count']) {
      await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
    }
    await expect(page.getByText('Moved today').first()).toBeVisible();
    await expect(page.getByText('GRNs awaiting entry').first()).toBeVisible();
  });

  test('§1.4 pending requests list shows Approve & issue only on a PENDING detail, never on the list', async ({ page }) => {
    await page.goto('/mis/store/requests');
    await expect(vis(page.getByText('Material requests'))).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve & issue' })).toHaveCount(0);
  });

  test('§4 bell is in the top bar, opens the Notifications dialog; the API answers 200', async ({ page }) => {
    await page.goto('/mis');
    const bell = vis(page.getByRole('button', { name: /^Notifications/ }));
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
    const res = await page.request.get('/api/mis/notifications');
    expect(res.status()).toBe(200);
  });

  test('§3.1 a DRAFT GRN shows the "Delivery paperwork" form without the amount field', async ({ page }) => {
    await page.goto('/mis/grn');
    const draftRow = page.locator('tr:visible').filter({ hasText: 'DRAFT' }).locator('a[href^="/mis/grn/"]').first();
    if ((await draftRow.count()) === 0) test.skip(true, 'no DRAFT GRN on the list — the paperwork form shows on drafts only');
    await page.goto((await draftRow.getAttribute('href'))!);
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    await expect(vis(page.getByText('Delivery paperwork'))).toBeVisible();
    for (const label of ['Supplier Invoice No', 'Invoice Date', 'DC Number', 'LR Number', 'Vehicle Number', 'Transporter']) {
      await expect(vis(page.getByLabel(label, { exact: true }))).toBeVisible();
    }
    await expect(page.getByLabel(/Supplier Invoice Amount/)).toHaveCount(0);
    await expect(page.getByText('₹')).toHaveCount(0);
  });

  test('§3.7 PO detail shows the 3-way match table (when a GRN exists) and never the rupee tiles', async ({ page }) => {
    const href = await firstDetailHref(page, '/mis/po', '/mis/po/');
    await page.goto(href);
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    await expect(page.getByText('PO value')).toHaveCount(0);
    await expect(page.getByText('Received value')).toHaveCount(0);
    if ((await page.getByText('3-way match').count()) === 0) test.skip(true, 'this PO has no GRN yet — the match card appears only then');
    for (const col of ['Ordered', 'Received', 'Damaged', 'Short', 'Outstanding']) {
      await expect(vis(page.getByRole('columnheader', { name: col }))).toBeVisible();
    }
  });

  test('§3.8 GRN print (A4) shows DC / Received / Damaged / Short columns', async ({ page }) => {
    const id = idFrom(await firstDetailHref(page, '/mis/grn', '/mis/grn/'), '/mis/grn/');
    await page.goto(`/mis/print/grn/${id}`);
    await expect(vis(page.getByText('GOODS RECEIPT NOTE'))).toBeVisible();
    for (const col of ['DC Qty', 'Received', 'Damaged', 'Short']) {
      await expect(vis(page.getByRole('columnheader', { name: col }))).toBeVisible();
    }
    await expect(page.getByText('₹')).toHaveCount(0);
  });

  test('§2.3 the issue screen loads with its order chips and the General issue option', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/mis/store/issue');
    await expect(page.getByText(CRASH)).toHaveCount(0);
    await expect(vis(page.getByRole('button', { name: 'General issue' }))).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('§5.8 QC templates settings page is refused', async ({ page }) => {
    await page.goto('/mis/settings/qc-templates');
    await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
  });

  test('§6 employee photo endpoint refuses (403/404), never 500; employees list is refused', async ({ page }) => {
    const res = await page.request.get('/api/mis/employees/00000000-0000-4000-8000-000000000000/photo');
    expect([403, 404]).toContain(res.status());
    await page.goto('/mis/employees');
    await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
  });
});
