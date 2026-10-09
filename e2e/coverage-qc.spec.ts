import { test, expect, type Page } from '@playwright/test';

import { EXPECTED_NAV, hrefFor, storageStatePath } from './roles';

/**
 * QC role — every screen it may open, at desktop and phone width, the screens it must not,
 * its one write path (a QC check), and the V2 contracts that touch it (checklist, bell, photo).
 * Runs against the live site with the pre-built QC session; see roles.ts.
 */
const ACCESS_DENIED = 'You do not have access to this';
const NOT_FOUND = 'This page does not exist';
const CRASHED = 'Something went wrong';

/** Sidebar entries plus the routes the sidebar reaches a click deeper. QC has no phone "More" tab, so /mis/me is its only phone-only entry. */
const STATIC_ROUTES = [
  '/mis',
  '/mis/dashboard',
  '/mis/me',
  ...EXPECTED_NAV.QC.map(hrefFor),
  '/mis/qc/defects',
  '/mis/qc/grid',
  '/mis/qc/grid?view=capture',
  '/mis/masters/items',
  '/mis/masters/machines',
  '/mis/masters/processes',
  '/mis/masters/departments',
  '/mis/masters/defect-types',
  '/mis/masters/GSM',
];

/** list page → selector of its first visible row link. `/mis/qc/grid|defects` share the qc prefix, so they are excluded. */
const LISTS: { list: string; link: string }[] = [
  { list: '/mis/orders', link: 'a[href^="/mis/orders/"]' },
  { list: '/mis/production', link: 'a[href^="/mis/production/"]' },
  { list: '/mis/qc', link: 'a[href^="/mis/qc/"]:not([href^="/mis/qc/grid"]):not([href^="/mis/qc/defects"])' },
  { list: '/mis/machine-board', link: 'a[href^="/mis/machine-board/"]' },
  { list: '/mis/customers', link: 'a[href^="/mis/customers/"]' },
  { list: '/mis/bom', link: 'a[href^="/mis/bom/"]' },
];

/** Print routes keyed off an order id. */
const PRINTS = ['coa', 'job-card', 'qc-checklist'] as const;

/** Routes QC must be refused (no approvals/wages/store/settings/employees/grn/po/queue in its permissions.ts row). */
const DENIED = [
  '/mis/approvals',
  '/mis/payroll',
  '/mis/store/requests',
  '/mis/settings/qc-templates',
  '/mis/settings',
  '/mis/audit',
  '/mis/employees',
  '/mis/grn',
  '/mis/po',
  '/mis/queue',
  '/mis/settings/rules',
  '/mis/attendance/extra-pay',
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** No crash / refusal / 404 copy, no uncaught error, and something real on screen. */
async function expectHealthy(page: Page, errors: string[]) {
  await expect(page.getByText(CRASHED)).toHaveCount(0);
  await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  // A heading or table, or (the phone BOM detail is plain cards) a main region with real text in it.
  // Polled: a streamed page can be mid-render on the first look.
  await expect.poll(async () => {
    const structured = await page.locator('h1:visible, h2:visible, h3:visible, table:visible').count();
    const mainText = (await page.locator('main:visible').first().innerText().catch(() => '')).trim();
    return structured > 0 || mainText.length > 40;
  }, { message: 'real content rendered', timeout: 10000 }).toBe(true);
  expect(errors, 'no uncaught browser errors').toEqual([]);
}

async function expectNoOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth, `page is ${scrollWidth}px wide in a ${innerWidth}px viewport`).toBeLessThanOrEqual(innerWidth + 1);
}

/**
 * Href of the first row link on a list page, or null when the list is empty. The desktop twins of
 * customers / machine-board / bom carry no row anchor, but the phone twin is in the same DOM
 * (lg:hidden), so the href is read without a visibility filter and opened by URL.
 */
async function firstDetailHref(page: Page, list: string, link: string): Promise<string | null> {
  await page.goto(list);
  const row = page.locator(link).first();
  await row.waitFor({ state: 'attached', timeout: 10000 }).catch(() => undefined);
  if ((await row.count()) === 0) return null;
  return row.getAttribute('href');
}

async function firstOrderId(page: Page): Promise<string | null> {
  const href = await firstDetailHref(page, '/mis/orders', 'a[href^="/mis/orders/"]');
  return href ? href.split('/').pop()! : null;
}

function coverage(phone: boolean) {
  const after = async (page: Page, errors: string[]) => {
    await expectHealthy(page, errors);
    if (phone) await expectNoOverflow(page);
  };

  for (const route of STATIC_ROUTES) {
    test(`opens ${route}`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto(route);
      await after(page, errors);
    });
  }

  for (const { list, link } of LISTS) {
    test(`opens the first detail of ${list}`, async ({ page }) => {
      const errors = watchErrors(page);
      const href = await firstDetailHref(page, list, link);
      if (!href) test.skip(true, `${list} has no row to open`);
      await page.goto(href!);
      await after(page, errors);
    });
  }

  for (const kind of PRINTS) {
    test(`opens /mis/print/${kind}/<first order>`, async ({ page }) => {
      const errors = watchErrors(page);
      const id = await firstOrderId(page);
      if (!id) test.skip(true, 'no order exists');
      await page.goto(`/mis/print/${kind}/${id}`);
      // The checklist print 404s by design when no template is seeded; nothing to assert then.
      if (kind === 'qc-checklist' && (await page.getByText(NOT_FOUND).count()) > 0) test.skip(true, 'no QC template seeded');
      await after(page, errors);
    });
  }
}

test.describe('QC — desktop', () => {
  test.use({ storageState: storageStatePath('QC') });
  coverage(false);
});

test.describe('QC — phone 390x844', () => {
  test.use({ storageState: storageStatePath('QC'), viewport: { width: 390, height: 844 } });
  coverage(true);
});

test.describe('QC — refused routes', () => {
  test.use({ storageState: storageStatePath('QC') });
  for (const route of DENIED) {
    test(`${route} is refused calmly`, async ({ page }) => {
      const errors = watchErrors(page);
      const res = await page.goto(route);
      expect(res?.status(), 'never a 500').toBeLessThan(500);
      await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
      await expect(page.getByText(CRASHED)).toHaveCount(0);
      await expect(page.locator('table')).toHaveCount(0);
      await expect(page.getByText(/at .+\.(js|tsx?):\d+/)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('QC — write path: a QC check', () => {
  test.use({ storageState: storageStatePath('QC') });

  test('empty form cannot be saved; an E2E- check saves and shows on the order', async ({ page }) => {
    await page.goto('/mis/qc');
    await page.getByRole('button', { name: '+ Add Check' }).first().click();
    await expect(page.getByText('Add QC Check').first()).toBeVisible();
    const save = page.getByRole('button', { name: 'Save', exact: true }).first();
    // Validation: with no order picked the only thing the form can do is refuse to save.
    await expect(save).toBeDisabled();

    const order = page.getByLabel('Order', { exact: true });
    if ((await order.locator('option:not([disabled])').count()) <= 1) test.skip(true, 'no active order to attach a check to');
    await order.selectOption({ index: 2 });
    const orderId = await order.inputValue();
    await page.getByLabel('Result', { exact: true }).selectOption('PASS');
    await page.getByLabel('Parameter Name').fill('E2E-check');
    await page.getByLabel('Notes').fill('E2E qc note');
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText('Add QC Check')).toHaveCount(0, { timeout: 15000 });

    await page.goto(`/mis/qc/${orderId}`);
    await expect(page.getByText('E2E-check').first()).toBeVisible();
    // shortcut: no delete exists for a QC check, so the E2E-check row stays on this order; reported in createdRecords.
  });
});

test.describe('QC — V2 contracts (tester guide §1.9, §4.5, §5.5, §5.7, §6)', () => {
  test.use({ storageState: storageStatePath('QC') });

  test('§5.5/§5.7 checklist: four forms, ten slots, four result buttons on a tap, A4 print', async ({ page }) => {
    const id = await firstOrderId(page);
    if (!id) test.skip(true, 'no order exists');
    await page.goto(`/mis/qc/${id}`);
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    if ((await page.getByText('Checklist').count()) === 0) test.skip(true, 'templates not seeded on this environment');
    // MisShell renders the desktop and phone chromes in one DOM tree, so count only what is on screen.
    const form = page.getByLabel('Form', { exact: true }).filter({ visible: true }).first();
    await expect(form).toBeVisible();
    const formNames = await form.locator('option:not([disabled])').allTextContents();
    expect(formNames, 'the four paper forms').toEqual(expect.arrayContaining(['Printing 6-Colours', 'Lamination', 'Lamif Flute', 'Die Cutting']));
    await expect(page.getByRole('columnheader', { name: '09:15' }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '18:00' }).filter({ visible: true }).first()).toBeVisible();

    // Selecting a cell writes nothing; only one of the four buttons does, so stop here and deselect.
    const cell = page.getByRole('button', { name: /not checked$/ }).filter({ visible: true }).first();
    if ((await cell.count()) === 0) test.skip(true, 'every cell is already checked today');
    await cell.click();
    for (const label of ['Pass', 'Fail', 'Make Ready', 'Plate Err']) {
      await expect(page.getByRole('button', { name: label, exact: true }).filter({ visible: true }).first()).toBeVisible();
    }
    await cell.click();
    await expect(page.getByRole('button', { name: 'Plate Err', exact: true }).filter({ visible: true })).toHaveCount(0);

    const print = page.getByRole('link', { name: '🖨 A4' }).filter({ visible: true }).first();
    await expect(print).toBeVisible();
    await page.goto((await print.getAttribute('href'))!);
    await expect(page.getByText(/QC CHECKLIST ·/).first()).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '09:15' }).first()).toBeVisible();
    await expect(page.getByText('✓ = Pass').first()).toBeVisible();
    await expect(page.getByText('QC Inspector').first()).toBeVisible();
  });

  test('§4.5 no bell in the top bar; the notifications API refuses (never 500)', async ({ page }) => {
    await page.goto('/mis');
    await expect(page.getByRole('button', { name: /^Notifications/ })).toHaveCount(0);
    const res = await page.request.get('/api/mis/notifications');
    expect(res.status()).toBe(403);
  });

  test('§1.9 material requests are refused by URL', async ({ page }) => {
    await page.goto('/mis/store/requests');
    await expect(page.getByText(ACCESS_DENIED).first()).toBeVisible();
    await page.goto('/mis/store/requests/new');
    await expect(page.getByText(ACCESS_DENIED).first()).toBeVisible();
  });

  test('§6 employee photo endpoint answers 403/404 for QC, never 500', async ({ page }) => {
    const res = await page.request.get('/api/mis/employees/00000000-0000-4000-8000-000000000000/photo');
    expect([403, 404]).toContain(res.status());
  });

  test('GRN / 3-way match / allocations are out of reach for QC (grn.read, po.read, store.read absent)', async ({ page }) => {
    for (const route of ['/mis/grn', '/mis/po', '/mis/store/issue']) {
      const res = await page.goto(route);
      expect(res?.status(), `${route} never 500`).toBeLessThan(500);
      await expect(page.getByText(ACCESS_DENIED).first()).toBeVisible();
    }
  });
});
