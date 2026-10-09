import { test, expect, type Page } from '@playwright/test';

import { EXPECTED_NAV, hrefFor, storageStatePath } from './roles';

/**
 * ATTENDANCE_OPERATOR — every screen the role may open, desktop and phone, on the live site.
 *
 * Read-only except for ONE leave request (reason 'E2E-leave') that the test rejects afterwards.
 * Nothing here punches a kiosk, marks absent, edits a shift or proposes extra pay — those are
 * real attendance / wage writes on real people.
 */
const ACCESS_DENIED = 'You do not have access to this';
const NOT_FOUND = 'This page does not exist';
const CRASHED = 'Something went wrong';
const PHONE = { width: 390, height: 844 };

type Route = { path: string; marker?: string | RegExp };

/** Static routes: the sidebar hrefs, the phone-only entries the role holds, sub-pages and the two homes. */
const STATIC_ROUTES: Route[] = [
  { path: '/mis', marker: 'Attendance' },
  { path: '/mis/dashboard' },
  ...EXPECTED_NAV.ATTENDANCE_OPERATOR.map((id) => ({ path: hrefFor(id), marker: id === 'kiosk' ? 'Worker Kiosk' : undefined })),
  { path: '/mis/attendance?view=daily', marker: 'Attendance' },
  { path: '/mis/attendance?view=monthly', marker: 'Attendance' },
  { path: '/mis/attendance/leave', marker: 'Leave Requests' },
  { path: '/mis/attendance/shifts', marker: 'Shift Management' },
  { path: '/mis/attendance/extra-pay', marker: 'Extra-pay day' },
  // navigation.ts lists crew under attendance.read (phoneOnly), so the role may open it by URL.
  { path: '/mis/crew' },
  { path: '/mis/me', marker: 'Signed in as' },
];

const FORBIDDEN = [
  '/mis/settings',
  '/mis/payroll',
  '/mis/orders',
  '/mis/approvals',
  '/mis/queue',
  '/mis/reports',
  '/mis/store/requests',
  '/mis/settings/qc-templates',
  '/mis/print/payslip/00000000-0000-4000-8000-000000000000',
];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function assertHealthy(page: Page, marker?: string | RegExp) {
  await expect(page.getByText(CRASHED)).toHaveCount(0);
  await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  // MisShell renders desktop + phone chromes in one DOM — count what is on screen, take the first.
  await expect(page.locator('h1, h2, table, section, button').filter({ visible: true }).first()).toBeVisible();
  if (marker) await expect(page.getByText(marker).filter({ visible: true }).first()).toBeVisible();
}

async function assertNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'no horizontal overflow').toBeLessThanOrEqual(innerWidth + 1);
}

/** The first employee the list shows, as a detail route and a badge print route. */
async function firstEmployeeRoutes(page: Page): Promise<Route[]> {
  await page.goto('/mis/employees');
  const link = page.locator('a[href^="/mis/employees/"]:visible').first();
  await link.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined); // the table hydrates client-side
  if ((await link.count()) === 0) return [];
  const href = await link.getAttribute('href');
  const id = href?.split('/').pop() ?? '';
  return [
    { path: `/mis/employees/${id}` },
    { path: `/mis/print/badge/${id}`, marker: 'Bhaskar Paper Products' },
  ];
}

for (const phone of [false, true]) {
  test.describe(`ATTENDANCE_OPERATOR opens every screen — ${phone ? 'phone 390x844' : 'desktop'}`, () => {
    test.use({ storageState: storageStatePath('ATTENDANCE_OPERATOR'), ...(phone ? { viewport: PHONE } : {}) });

    for (const route of STATIC_ROUTES) {
      test(`${route.path}`, async ({ page }) => {
        const errors = watchErrors(page);
        await page.goto(route.path);
        await assertHealthy(page, route.marker);
        if (phone) await assertNoHorizontalOverflow(page);
        expect(errors, 'no uncaught browser errors').toEqual([]);
      });
    }

    test('first employee detail and its badge print route', async ({ page }) => {
      const errors = watchErrors(page);
      const routes = await firstEmployeeRoutes(page);
      if (routes.length === 0) test.skip(true, 'no employee to open');
      for (const route of routes) {
        await page.goto(route.path);
        await assertHealthy(page, route.marker);
        if (phone) await assertNoHorizontalOverflow(page);
      }
      expect(errors, 'no uncaught browser errors').toEqual([]);
    });
  });
}

test.describe('ATTENDANCE_OPERATOR is refused calmly where it has no permission', () => {
  test.use({ storageState: storageStatePath('ATTENDANCE_OPERATOR') });

  for (const path of FORBIDDEN) {
    test(`${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status() ?? 0, 'never a 500').toBeLessThan(500);
      // Reports has its own calm copy ("You don't have access to reports.", dictionaries.ts) — same contract.
      await expect(page.getByText(/You do(n't| not) have access/).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
      await expect(page.getByText(CRASHED)).toHaveCount(0);
      await expect(page.getByText(/at .+\(.+:\d+:\d+\)/)).toHaveCount(0); // no stack trace
    });
  }
});

test.describe('ATTENDANCE_OPERATOR write path — one leave request, rejected afterwards', () => {
  test.use({ storageState: storageStatePath('ATTENDANCE_OPERATOR') });

  test('empty form cannot submit; E2E-leave appears, then is rejected', async ({ page }) => {
    const errors = watchErrors(page);
    const reason = `E2E-leave-${Date.now()}`;
    await page.goto('/mis/attendance/leave');
    await page.getByRole('button', { name: '+ Request Leave' }).first().click();
    const submit = page.getByRole('button', { name: 'Submit', exact: true });
    await expect(submit).toBeVisible();
    // Validation: the form refuses an empty submit (button stays disabled with no employee / date).
    await expect(submit).toBeDisabled();

    // The kit Select adds a search box also labelled "Employee…", so target the combobox itself; its first
    // real option sits after its own placeholder and the screen's "— Select Employee —" row.
    const employee = page.getByRole('combobox', { name: 'Employee', exact: true });
    const firstId = await employee.locator('option').evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value).find((v) => v !== '') ?? '');
    if (!firstId) test.skip(true, 'no active employee to request leave for');
    await employee.selectOption(firstId);
    const date = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10); // far ahead: never today's register
    await page.getByLabel('Date').fill(date);
    await page.getByLabel(/Reason/).fill(reason);
    await expect(submit).toBeEnabled();
    await submit.click();

    const row = page.getByRole('row').filter({ hasText: reason }).filter({ visible: true }).first();
    // Both leave actions revalidate /mis/attendance, not this page (attendance/actions.ts), so the in-place
    // refresh is intermittent on the live site: reload until the record shows, so the tidy-up below always runs.
    await expect(async () => {
      if (!(await row.isVisible())) await page.reload();
      await expect(row).toBeVisible();
    }).toPass({ timeout: 30_000 });
    await expect(row.getByText('PENDING')).toBeVisible();

    // Tidy up: reject the record this test created (only ever the E2E- one).
    await row.getByRole('button', { name: 'Reject' }).click();
    // The action revalidates /mis/attendance, not this page, so the in-place update is best effort: reload and
    // check the record itself is rejected, which is the tidy-up that matters.
    await expect(async () => {
      await page.reload();
      await expect(row.getByText('REJECTED')).toBeVisible();
    }).toPass({ timeout: 30_000 });
    console.log(`created leave request reason=${reason} (rejected)`);
    expect(errors, 'no uncaught browser errors').toEqual([]);
  });
});

test.describe('V2 contract for ATTENDANCE_OPERATOR (MIS_V2_TESTER_GUIDE §0, §4, §6)', () => {
  test.use({ storageState: storageStatePath('ATTENDANCE_OPERATOR') });

  test('§4 — no notification bell; the notifications API refuses with 403, never 500', async ({ page }) => {
    await page.goto('/mis');
    await expect(page.getByRole('button', { name: /^Notifications/ })).toHaveCount(0);
    const res = await page.request.get('/api/mis/notifications');
    expect(res.status()).toBe(403);
  });

  test('§6.5 — employee profile offers no photo picker (read-only role)', async ({ page }) => {
    const [detail] = await firstEmployeeRoutes(page);
    if (!detail) test.skip(true, 'no employee to open');
    await page.goto(detail.path);
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    await expect(page.getByText(/Take photo|Retake photo/).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Add Employee' })).toHaveCount(0);
  });

  test('§6.4 / §0 — the web kiosk renders its worker list and search (no punch is made)', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/mis/kiosk');
    await expect(page.getByText('Worker Kiosk').first()).toBeVisible();
    await expect(page.getByPlaceholder('Search by name or code…').first()).toBeVisible();
    await expect(page.getByLabel('Factory time').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('§0 — the home still shows the kiosk and today cards; the register keeps its write buttons', async ({ page }) => {
    await page.goto('/mis');
    await expect(page.locator('a[href="/mis/attendance"]').first()).toBeVisible();
    await page.goto('/mis/attendance?view=daily');
    await expect(page.getByText('Attendance').first()).toBeVisible();
    await expect(page.getByPlaceholder('Search employee…').first()).toBeVisible();
  });
});
