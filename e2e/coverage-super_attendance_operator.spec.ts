import { test, expect, type Page } from '@playwright/test';

import { EXPECTED_NAV, hrefFor, storageStatePath } from './roles';

/**
 * SUPER_ATTENDANCE_OPERATOR — full screen coverage on the live site.
 *
 * employees.read · attendance.read/write · reports.read · queue.review (lib/mis/permissions.ts).
 * Every screen the role may open is visited at desktop and phone width; the screens it may not
 * open must refuse calmly; the one safe write (a leave request) is created with an `E2E-` reason
 * and rejected again by the same role so nothing real is touched.
 */
const ROLE = 'SUPER_ATTENDANCE_OPERATOR';
const ACCESS_DENIED = 'You do not have access to this';
const NOT_FOUND = 'This page does not exist';
const CRASH = 'Something went wrong';

/** Static routes the role may open: home, dashboard, the sidebar, the phone-only entries it holds, sub-pages. */
const ALLOWED = [
  '/mis',
  '/mis/dashboard',
  ...EXPECTED_NAV[ROLE].map(hrefFor),
  '/mis/attendance/leave', // phoneOnly, requires attendance.read
  '/mis/me', // phoneOnly, any role
  '/mis/attendance?view=daily',
  '/mis/attendance?view=monthly',
  '/mis/attendance/shifts',
  '/mis/attendance/extra-pay', // attendance.write
];

/** Routes the role must NOT open (no orders/settings/store/po/grn/wages/approvals permission). */
const FORBIDDEN = [
  '/mis/crew', // the worker board is production.read (its data is), so the menu no longer offers it
  '/mis/orders',
  '/mis/settings',
  '/mis/settings/qc-templates',
  '/mis/settings/rules',
  '/mis/store/requests',
  '/mis/approvals',
  '/mis/payroll',
  '/mis/grn',
  '/mis/po',
  '/mis/masters',
];

/** The employee list's row links appear after hydration, so wait briefly before deciding there are none. */
async function firstEmployeeLink(page: Page) {
  await page.goto('/mis/employees');
  const first = page.locator('a[href^="/mis/employees/"]:visible').first();
  await first.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
  return (await first.count()) > 0 ? first : null;
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

async function assertHealthy(page: Page, errors: string[], phone: boolean, content = 'h1:visible, h2:visible, table:visible') {
  await expect(page.getByText(CRASH)).toHaveCount(0);
  await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
  await expect(page.getByText(NOT_FOUND)).toHaveCount(0);
  // MisShell renders desktop + phone chromes in one DOM, so only count what is on screen.
  await expect(page.locator(content).first()).toBeVisible();
  expect(errors, 'no uncaught browser errors').toEqual([]);
  if (phone) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'no horizontal overflow at 390px').toBeLessThanOrEqual(1);
  }
}

function coverage(label: string, viewport: { width: number; height: number }) {
  const phone = viewport.width < 768;
  test.describe(`${ROLE} opens every screen — ${label}`, () => {
    test.use({ storageState: storageStatePath(ROLE), viewport });

    for (const route of ALLOWED) {
      test(`${route}`, async ({ page }) => {
        const errors = watchErrors(page);
        await page.goto(route);
        await assertHealthy(page, errors, phone);
      });
    }

    test('first employee detail, then its badge print', async ({ page }) => {
      const errors = watchErrors(page);
      const first = await firstEmployeeLink(page);
      if (!first) test.skip(true, 'no employee to open');
      await first!.click();
      await expect(page).toHaveURL(/\/mis\/employees\/[0-9a-f-]{36}/);
      await assertHealthy(page, errors, phone);
      const id = page.url().split('/').pop();
      await page.goto(`/mis/print/badge/${id}`);
      // The badge sheet has no heading: its content is the QR image and the company line.
      await assertHealthy(page, errors, phone, 'main svg:visible');
      await expect(page.getByRole('link', { name: 'Back to Employees' })).toBeVisible();
    });
  });
}

coverage('desktop 1280x800', { width: 1280, height: 800 });
coverage('phone 390x844', { width: 390, height: 844 });

test.describe(`${ROLE} is refused calmly where it has no permission`, () => {
  test.use({ storageState: storageStatePath(ROLE) });

  for (const route of FORBIDDEN) {
    test(`${route}`, async ({ page }) => {
      const errors = watchErrors(page);
      const res = await page.goto(route);
      expect(res?.status(), 'never a 500').not.toBe(500);
      await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
      await expect(page.getByText(CRASH)).toHaveCount(0);
      await expect(page.locator('table')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test('payslip print needs wages.read', async ({ page }) => {
    const first = await firstEmployeeLink(page);
    if (!first) test.skip(true, 'no employee');
    const id = (await first!.getAttribute('href'))!.split('/').pop();
    const res = await page.goto(`/mis/print/payslip/${id}`);
    expect(res?.status()).not.toBe(500);
    await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
  });
});

test.describe(`${ROLE} write path — leave request`, () => {
  test.use({ storageState: storageStatePath(ROLE) });

  test('empty form cannot submit; an E2E- request is created, listed and then rejected', async ({ page }) => {
    const reason = `E2E-leave-${Date.now()}`;
    await page.goto('/mis/attendance/leave');
    await page.getByRole('button', { name: '+ Request Leave' }).click();
    const dialog = page.getByRole('dialog', { name: 'Request Leave' });
    const submit = dialog.getByRole('button', { name: 'Submit' });
    // Validation: the form refuses an empty submit by keeping the button disabled.
    await expect(submit).toBeDisabled();

    const employee = dialog.getByLabel('Employee', { exact: true });
    const firstId = await employee.locator('option:not([value=""])').first().getAttribute('value');
    if (!firstId) test.skip(true, 'no active employee to request leave for');
    await employee.selectOption(firstId!);
    await expect(submit).toBeDisabled(); // still needs a date
    await dialog.getByLabel('Date', { exact: true }).fill('2031-01-15');
    await dialog.getByLabel('Reason (optional)').fill(reason);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(dialog).toBeHidden();

    // The list should show the new row without a manual reload (the action revalidates).
    const row = page.getByRole('row').filter({ hasText: reason });
    await expect.soft(row, 'new request listed without reload').toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(row).toBeVisible();
    await expect(row).toContainText('PENDING');

    // Tidy up: reject our own E2E- request (the only state change the UI offers).
    await row.getByRole('button', { name: 'Reject' }).click();
    await expect.soft(row, 'row updates to REJECTED without reload').toContainText('REJECTED', { timeout: 10_000 });
    await page.reload();
    await expect(row).toContainText('REJECTED');
    await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });
});

test.describe(`${ROLE} V2 contract (MIS_V2_TESTER_GUIDE.md)`, () => {
  test.use({ storageState: storageStatePath(ROLE) });

  test('§4.5 no notification bell; the feed API refuses without grn.read', async ({ page, request }) => {
    await page.goto('/mis');
    await expect(page.getByRole('button', { name: /^Notifications/ })).toHaveCount(0);
    const res = await request.get('/api/mis/notifications');
    expect(res.status()).toBe(403);
  });

  test('§6.5 employee profile has no photo picker (read-only on employees)', async ({ page }) => {
    const first = await firstEmployeeLink(page);
    if (!first) test.skip(true, 'no employee to open');
    await first!.click();
    await expect(page.getByText(ACCESS_DENIED)).toHaveCount(0);
    await expect(page.getByText(/Take photo|Retake photo/).filter({ visible: true })).toHaveCount(0);
  });

  test('§1.9 / §5.8 / §3: material requests, QC templates, GRN and PO are all refused', async ({ page }) => {
    for (const route of ['/mis/store/requests/new', '/mis/settings/qc-templates', '/mis/grn', '/mis/po']) {
      await page.goto(route);
      await expect(page.getByText(ACCESS_DENIED).or(page.getByText(NOT_FOUND)).first()).toBeVisible();
    }
  });

  test('home is the attendance home with the Super-only corrections card', async ({ page }) => {
    await page.goto('/mis');
    await expect(page.getByText('Clocked in today').first()).toBeVisible();
    await expect(page.getByText('Late this morning').first()).toBeVisible();
    await expect(page.getByText('Corrections open').first()).toBeVisible();
    await expect(page.locator('a[href="/mis/queue"]').first()).toBeVisible();
  });
});
