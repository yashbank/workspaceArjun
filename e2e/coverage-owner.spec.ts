import { test, expect, type Page } from '@playwright/test';

import { EXPECTED_NAV, hrefFor, storageStatePath } from './roles';

/**
 * OWNER — every screen the role may open, on desktop and at phone width, plus the role's
 * safe write path (a customer master row, deactivated afterwards) and the V2 UI contract
 * from docs/qa/MIS_V2_TESTER_GUIDE.md. OWNER holds every permission, so the "refused" set is
 * malformed / missing ids: the calm 404, never a 500.
 */
const ACCESS_DENIED = 'You do not have access to this';
const NOT_FOUND = 'This page does not exist';
const CRASHED = 'Something went wrong';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

const PHONE_ONLY = ['/mis/crew', '/mis/attendance/leave', '/mis/settings/users', '/mis/settings/rules', '/mis/me'];
const SUB_PAGES = [
  '/mis/attendance/extra-pay', '/mis/attendance/shifts',
  '/mis/masters/departments', '/mis/masters/items', '/mis/masters/machines', '/mis/masters/processes', '/mis/masters/defect-types', '/mis/masters/GSM',
  '/mis/qc/defects', '/mis/qc/grid',
  '/mis/settings/aql', '/mis/settings/devices', '/mis/settings/qc-templates', '/mis/settings/wages',
  '/mis/store/count', '/mis/store/dashboard', '/mis/store/issue', '/mis/store/receive', '/mis/store/requests', '/mis/store/requests/new', '/mis/store/stock', '/mis/store/transactions',
];
const ROUTES = ['/mis', '/mis/dashboard', ...EXPECTED_NAV.OWNER.map(hrefFor), ...PHONE_ONLY, ...SUB_PAGES];

/** List → first row's detail (a UUID path), and the print routes keyed on that same id. */
const LISTS: { list: string; detail: string; prints?: string[] }[] = [
  { list: '/mis/orders', detail: '/mis/orders/', prints: ['job-card', 'coa', 'qc-checklist'] },
  { list: '/mis/production', detail: '/mis/production/' },
  { list: '/mis/qc', detail: '/mis/qc/' },
  { list: '/mis/employees', detail: '/mis/employees/', prints: ['badge', 'payslip'] },
  { list: '/mis/po', detail: '/mis/po/', prints: ['po'] },
  { list: '/mis/grn', detail: '/mis/grn/', prints: ['grn'] },
  { list: '/mis/inventory', detail: '/mis/inventory/' },
  { list: '/mis/customers', detail: '/mis/customers/' },
  { list: '/mis/suppliers', detail: '/mis/suppliers/' },
  { list: '/mis/machine-board', detail: '/mis/machine-board/' },
  { list: '/mis/bom', detail: '/mis/bom/' },
  { list: '/mis/store/stock', detail: '/mis/store/ledger/' },
  { list: '/mis/store/requests', detail: '/mis/store/requests/' },
];

const REFUSED = [
  '/mis/no-such-screen',
  '/mis/orders/not-a-uuid',
  '/mis/print/po/not-a-uuid',
  '/mis/employees/00000000-0000-4000-8000-000000000000',
  '/mis/store/requests/00000000-0000-4000-8000-000000000000',
];

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function assertHealthy(page: Page, errors: string[], phone: boolean) {
  await expect(page.getByText(CRASHED)).toHaveCount(0);
  await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  // Real content: a badge print has no heading or table, so the test is "the main area says something".
  const main = page.locator('main:visible').first(); // MisShell renders the desktop and phone chromes in one DOM
  await expect(main).toBeVisible();
  // Streamed pages show a spinner first, so poll until the text arrives.
  await expect.poll(async () => (await main.innerText()).trim().length, { message: 'main area has content', timeout: 20_000 }).toBeGreaterThan(20);
  expect(errors, 'no uncaught browser errors').toEqual([]);
  // A4 print layouts are paper-width by design, so only app screens are held to the phone width.
  if (phone && !page.url().includes('/mis/print/')) {
    const { scrollWidth, innerWidth, culprits } = await page.evaluate(() => {
      const w = window.innerWidth + 1;
      const culprits = [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > w)
        .slice(0, 4)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 4).join('.')}`);
      return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, culprits };
    });
    expect(scrollWidth, `no horizontal overflow (${culprits.join(' > ')})`).toBeLessThanOrEqual(innerWidth + 1);
  }
}

/** The first few visible row links under `prefix` whose path is a UUID (so `/new`, `/defects` etc. are skipped). */
async function detailHrefs(page: Page, prefix: string, max = 6): Promise<string[]> {
  const links = page.locator(`a[href^="${prefix}"]:visible`);
  await links.first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const hrefs = await links.evaluateAll((els) => els.map((a) => a.getAttribute('href') ?? ''));
  return [...new Set(hrefs.filter((h) => UUID.test(h.slice(prefix.length))))].slice(0, max);
}
const firstDetailHref = async (page: Page, prefix: string) => (await detailHrefs(page, prefix, 1))[0] ?? null;

function coverage(phone: boolean) {
  test.describe(phone ? 'phone 390x844' : 'desktop 1280x800', () => {
    test.use({ storageState: storageStatePath('OWNER'), viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 } });
    test.setTimeout(90_000);

    for (const route of ROUTES) {
      test(`opens ${route}`, async ({ page }) => {
        const errors = watch(page);
        await page.goto(route);
        await assertHealthy(page, errors, phone);
      });
    }

    for (const { list, detail, prints = [] } of LISTS) {
      test(`first detail of ${list}${prints.length ? ' + print' : ''}`, async ({ page }) => {
        const errors = watch(page);
        await page.goto(list);
        const href = await firstDetailHref(page, detail);
        if (!href) test.skip(true, `no row under ${list} to open`);
        await page.locator(`a[href="${href}"]:visible`).first().click();
        await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        await assertHealthy(page, errors, phone);
        const id = href!.slice(detail.length).match(UUID)![0];
        for (const kind of prints) {
          await page.goto(`/mis/print/${kind}/${id}`);
          await assertHealthy(page, errors, phone);
        }
      });
    }
  });
}

coverage(false);
coverage(true);

test.describe('OWNER — refused routes are the calm 404, never a 500', () => {
  test.use({ storageState: storageStatePath('OWNER') });
  for (const route of REFUSED) {
    test(`refuses ${route}`, async ({ page }) => {
      const errors = watch(page);
      const res = await page.goto(route);
      expect(res?.status() ?? 0, 'not a server error').toBeLessThan(500);
      await expect(page.getByText(NOT_FOUND).or(page.getByText(ACCESS_DENIED)).first()).toBeVisible();
      await expect(page.getByText(CRASHED)).toHaveCount(0);
      await expect(page.getByText(/Application error|at .+\.js:\d+/)).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('OWNER — write path: a customer master row, then deactivated', () => {
  test.use({ storageState: storageStatePath('OWNER') });
  test.setTimeout(90_000);

  test('empty submit is refused, E2E-customer is created, then deactivated', async ({ page }) => {
    const errors = watch(page);
    await page.goto('/mis/customers?create=1');
    const form = page.getByRole('complementary', { name: 'Add' });
    await expect(form).toBeVisible();
    // Native `required` lets whitespace through, so this reaches the server-side validation.
    await form.locator('#d10-code').fill(' ');
    await form.locator('#d10-name').fill(' ');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(form.getByRole('alert')).toContainText(/is required/);

    const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
    console.log(`created customer ${code}`); // so the record shows in the report
    await form.locator('#d10-code').fill(code);
    await form.locator('#d10-name').fill('E2E-customer');
    await form.locator('#d10-city').fill('E2E city');
    await form.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/mis\/customers$/);
    const row = page.getByRole('link', { name: code }).first();
    await expect(row).toBeVisible();

    // Tidy up: deactivate (the UI never deletes a master row).
    await row.click();
    const edit = page.getByRole('complementary', { name: 'Edit' });
    await expect(edit.locator('#d10-code')).toHaveValue(code);
    await edit.getByRole('button', { name: 'Deactivate' }).click();
    await expect(page).toHaveURL(/deactivated=1/);
    await expect(page.getByText(code).first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('OWNER — V2 UI contract (MIS_V2_TESTER_GUIDE.md)', () => {
  test.use({ storageState: storageStatePath('OWNER') });
  test.setTimeout(90_000);

  test('§3.2 a DRAFT GRN paperwork form includes Supplier Invoice Amount', async ({ page }) => {
    await page.goto('/mis/grn');
    for (const href of await detailHrefs(page, '/mis/grn/')) {
      await page.goto(href);
      if ((await page.getByText('Delivery paperwork').count()) === 0) continue;
      await expect(page.getByLabel(/Supplier Invoice No/).first()).toBeVisible();
      await expect(page.getByLabel(/Supplier Invoice Amount/).first()).toBeVisible();
      return;
    }
    test.skip(true, 'no DRAFT GRN among the first rows — no paperwork form to inspect');
  });

  test('§3.6 the PO 3-way match shows rupee tiles to the Owner', async ({ page }) => {
    await page.goto('/mis/po');
    for (const href of await detailHrefs(page, '/mis/po/')) {
      await page.goto(href);
      if ((await page.getByText('3-way match').count()) === 0) continue;
      await expect(page.getByText('PO value').first()).toBeVisible();
      return;
    }
    test.skip(true, 'no PO with a GRN among the first rows — the match card appears only then');
  });

  test('§4 the bell is on the top bar, opens the Notifications panel with Clear all, and the feed answers 200', async ({ page, request }) => {
    await page.goto('/mis');
    await expect(page.getByText('Needs attention').first()).toBeVisible();
    const bell = page.getByRole('button', { name: /^Notifications/ }).first();
    await expect(bell).toBeVisible();
    await bell.click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/Clear all|Nothing|No notifications|caught up/i).first()).toBeVisible();
    expect((await request.get('/api/mis/notifications')).status()).toBe(200);
  });

  test('§5.1/§5.3 QC templates: the four forms with 10 slots; an empty template is refused', async ({ page }) => {
    await page.goto('/mis/settings/qc-templates');
    await expect(page.getByRole('heading', { name: 'QC checklist templates' })).toBeVisible();
    if ((await page.getByText('No templates yet').count()) > 0) test.skip(true, 'templates not seeded on this environment');
    for (const name of ['Printing 6-Colours', 'Lamination', 'Lamif Flute', 'Die Cutting']) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/10 slots 09:15–18:00/).first()).toBeVisible();
    await page.getByRole('button', { name: '+ New template' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('p.text-red-600')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('p.text-red-600')).toHaveCount(0);
  });

  test('§6 the employee profile offers the photo picker to the Owner', async ({ page }) => {
    await page.goto('/mis/employees');
    const href = await firstDetailHref(page, '/mis/employees/');
    if (!href) test.skip(true, 'no employee to open');
    await page.goto(href!);
    await expect(page.getByText(/Take photo|Retake photo/).filter({ visible: true })).toHaveCount(1);
  });

  test('§1 material requests: the list and the new-request screen render', async ({ page }) => {
    await page.goto('/mis/store/requests');
    await expect(page.getByText('Material requests').first()).toBeVisible();
    await page.goto('/mis/store/requests/new');
    await expect(page.getByText('Request material').first()).toBeVisible();
  });

  test('§2 order detail and its BOM render (allocation card appears only for earmarked stock)', async ({ page }) => {
    const errors = watch(page);
    await page.goto('/mis/orders');
    const href = await firstDetailHref(page, '/mis/orders/');
    if (!href) test.skip(true, 'no order exists');
    await page.goto(href!);
    await assertHealthy(page, errors, false);
    await page.goto(`/mis/bom/${href!.match(UUID)![0]}`);
    await assertHealthy(page, errors, false);
  });
});
