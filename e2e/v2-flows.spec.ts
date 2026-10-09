import { appendFileSync } from 'node:fs';
import path from 'node:path';

import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';

import { storageStatePath, type MisRoleName } from './roles';

/**
 * MIS V2 — the order → PO → GRN → allocation → issue → material-request chain, end to end on the
 * live site, with its OWN seed data. Every record carries an 'E2E-' marker where a text field
 * exists; the numbers it mints are printed at the end and appended as DELETEs to
 * scripts/e2e-cleanup.sql. Serial: each step builds on the last, so a failure stops the chain.
 *
 * Realtime push is proven the only way it can be: a second context is opened on /mis BEFORE the
 * write, and its bell count must rise without a reload or a focus change.
 */
test.describe.configure({ mode: 'serial', retries: 0 });

const TS = Date.now().toString(36).toUpperCase();
const STARTED = new Date();
/** MisShell renders the desktop and phone chromes in one DOM tree, so match only what is on screen. */
const vis = (l: Locator) => l.filter({ visible: true }).first();
const UUID = /[0-9a-f-]{36}$/;
const idFromUrl = (url: string) => url.match(UUID)![0];

/** Everything the chain mints, filled in step by step. */
const S = {
  itemName: '', itemCode: '', unit: '',
  orderNo: '', orderId: '', poNo: '', poId: '', grnNo: '', grnId: '',
  invoiceNo: `E2E-INV-${TS}`, mrn1: '', mrn2: '',
};
const PUSH = { OWNER: false, ADMIN: false, STORE_GUY: false };
/** Realtime sockets and console errors seen per role — printed at the end to explain a missed push. */
const DIAG: string[] = [];
/** Refusals whose reason did not reach the screen — recorded mid-chain, asserted empty in the last step. */
const DEFECTS: string[] = [];
async function recordRefusal(where: string, box: Locator) {
  const text = ((await box.textContent()) ?? '').trim();
  if (!text.includes('allocated')) DEFECTS.push(`${where}: refusal reads "${text.slice(0, 160)}"`);
}

/** Pages whose bell channel Realtime has acknowledged ("Subscribed to PostgreSQL"). */
const SUBSCRIBED = new WeakSet<Page>();

async function newPage(browser: Browser, role: MisRoleName): Promise<Page> {
  const page = await (await browser.newContext({ storageState: storageStatePath(role) })).newPage();
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/realtime/')) return;
    // Subscription replies and pushed rows, so a missed push can be told from a missed subscription.
    ws.on('framereceived', (f) => {
      const t = String(f.payload);
      if (t.includes('Subscribed to PostgreSQL')) SUBSCRIBED.add(page);
      if (/postgres_changes|"status":"error"|"event":"system"/.test(t)) DIAG.push(`${role} ws<- ${t.slice(0, 260)}`);
    });
  });
  page.on('console', (m) => { if (m.type() === 'error') DIAG.push(`${role} console: ${m.text().slice(0, 200)}`); });
  page.on('response', (r) => { if (r.status() >= 500) DIAG.push(`${role} HTTP ${r.status()} ${r.request().method()} ${r.url()}`); });
  return page;
}

async function open(browser: Browser, role: MisRoleName, url: string): Promise<Page> {
  const page = await newPage(browser, role);
  await page.goto(url);
  return page;
}

/** A bell role on /mis with its first unread fetch done and its Realtime channel acknowledged, so the baseline count is real. */
async function openBell(browser: Browser, role: MisRoleName): Promise<{ page: Page; before: number }> {
  const page = await newPage(browser, role);
  const loaded = page.waitForResponse((r) => r.url().endsWith('/api/mis/notifications'));
  await page.goto('/mis');
  await loaded;
  await expect(bell(page)).toBeVisible();
  await expect.poll(() => SUBSCRIBED.has(page), { message: `${role} bell channel subscribed`, timeout: 15000 }).toBe(true);
  return { page, before: await unread(page) };
}

const bell = (page: Page) => vis(page.getByRole('button', { name: /^Notifications/ }));
async function unread(page: Page): Promise<number> {
  return Number(((await bell(page).getAttribute('aria-label')) ?? '').match(/(\d+) unread/)?.[1] ?? 0);
}

/**
 * The live-push check: the count must rise within 20 s with no reload, and the item must be in the
 * dropdown. Recorded, not asserted here — a soft failure would still stop the serial chain — and
 * asserted once in the last step so the whole flow is exercised either way.
 */
async function recordPush(page: Page, role: keyof typeof PUSH, before: number, title: string) {
  const rose = await expect.poll(() => unread(page), { timeout: 20000 }).toBeGreaterThan(before).then(() => true, () => false);
  await bell(page).click();
  const dialog = page.getByRole('dialog', { name: 'Notifications' });
  await expect(dialog).toBeVisible();
  const listed = await dialog.getByText(title).first().waitFor({ timeout: 3000 }).then(() => true, () => false);
  PUSH[role] = rose && listed;
  DIAG.push(`${role} push: count rose=${rose} listed=${listed}`);
  await page.keyboard.press('Escape');
}

/** The cart used by Issue and Request material: search by code, add, type the qty. */
async function cartAdd(page: Page, qty: string) {
  await vis(page.getByLabel('Scan or search an item')).fill(S.itemCode);
  await vis(page.locator('button', { hasText: `${S.itemCode} ·` })).click();
  await vis(page.getByLabel(`Quantity of ${S.itemName} in ${S.unit}`)).fill(qty);
}

test('0 STORE_GUY: pick a raw-material / consumable item with stock to run the chain on', async ({ browser }) => {
  const page = await open(browser, 'STORE_GUY', '/mis/store/stock');
  const rows = page.locator('tr').filter({ hasText: /Raw Material|Consumable/ }).filter({ visible: true });
  await expect(rows.first()).toBeVisible({ timeout: 15000 });
  for (const row of await rows.all()) {
    // Columns: SKU · Item (name + code) · Category · Balance badge · Ledger link.
    const badge = (await row.locator('td').nth(3).textContent()) ?? '';
    // "346.00 KG" or, below the reorder level, "346.00 KGReorder ≥ 350" — stop the unit before "Reorder".
    const m = badge.match(/([\d.]+)\s+([A-Z_]+?)(?=Reorder|\s|$)/);
    if (!m || Number(m[1]) < 5) continue;
    S.itemName = ((await row.locator('a[href^="/mis/store/ledger/"]').first().textContent()) ?? '').trim();
    // The cart searches the item CODE (under the name), not the SKU in the first column.
    S.itemCode = ((await row.locator('td').nth(1).locator('.text-xs').first().textContent()) ?? '').trim();
    S.unit = m[2];
    break;
  }
  // A hard failure, not a skip: in serial mode it stops the chain before anything is created.
  expect(S.itemName, 'a raw-material/consumable item with a balance of 5+ exists on /mis/store/stock').not.toBe('');
  await page.context().close();
});

test('1 ADMIN: creates and confirms the order', async ({ browser }) => {
  const page = await open(browser, 'ADMIN', '/mis/orders');
  const desc = `E2E-flow order ${TS}`;
  await vis(page.getByRole('button', { name: '+ New Order' })).click();
  const dlg = page.getByRole('dialog', { name: 'New Order' });
  await dlg.getByLabel('Description', { exact: true }).fill(desc);
  await dlg.getByLabel('Notes', { exact: true }).fill(`E2E-flow ${TS}`);
  await dlg.getByRole('button', { name: 'Save' }).click();
  await expect(dlg).toBeHidden({ timeout: 15000 });
  const row = vis(page.locator('tr').filter({ hasText: desc }));
  await expect(row).toBeVisible({ timeout: 15000 });
  S.orderNo = ((await row.locator('.font-mono').first().textContent()) ?? '').trim();
  expect(S.orderNo).toMatch(/^ORD-\d{6}-\d{5}$/);
  S.orderId = idFromUrl((await row.locator('a[href^="/mis/orders/"]').first().getAttribute('href'))!);
  // The issue screen only offers CONFIRMED / IN_PRODUCTION orders (store.ts#listIssueTargets).
  await row.getByRole('button', { name: 'Confirm' }).click();
  await expect(row.getByText('CONFIRMED')).toBeVisible({ timeout: 15000 });
  await page.context().close();
});

test('2 ADMIN: raises a From-BOM PO on the order, adds 100 of the item, submits and approves it', async ({ browser }) => {
  const page = await open(browser, 'ADMIN', '/mis/po');
  await vis(page.getByRole('button', { name: '+ New PO' })).click();
  const dlg = page.getByRole('dialog', { name: 'New Purchase Order' });
  await dlg.getByLabel('Purpose', { exact: true }).selectOption('FOR_ORDER');
  await dlg.getByLabel('BOM Ref', { exact: true }).fill(S.orderNo);
  await dlg.getByLabel('Notes', { exact: true }).fill(`E2E-flow ${TS}`);
  await dlg.getByRole('button', { name: 'Create PO' }).click();
  await page.waitForURL(/\/mis\/po\/[0-9a-f-]{36}$/, { timeout: 20000 });
  S.poId = idFromUrl(page.url());
  S.poNo = ((await page.locator('h1').first().textContent()) ?? '').trim();
  expect(S.poNo).toMatch(/^PO-/);
  await expect(vis(page.getByText(S.orderNo))).toBeVisible();

  await page.getByRole('button', { name: '+ Add Item' }).click();
  const add = page.getByRole('dialog', { name: 'Add Line Item' });
  await add.getByLabel('Item (optional)', { exact: true }).selectOption({ label: S.itemName });
  await expect(add.getByLabel('Description', { exact: true })).toHaveValue(S.itemName);
  await add.getByLabel('Quantity', { exact: true }).fill('100');
  await add.getByRole('button', { name: 'Add Item' }).click();
  await expect(add).toBeHidden({ timeout: 15000 });
  await expect(vis(page.locator('tr').filter({ hasText: S.itemName }))).toContainText('100');

  await page.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(vis(page.getByText('PENDING APPROVAL'))).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Approve' }).click();
  // ADMIN_ONLY approves here; BOTH (total above the threshold) takes the Owner's second step.
  const approved = await page.getByText('APPROVED', { exact: true }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
  await page.context().close();
  if (!approved) {
    const owner = await open(browser, 'OWNER', `/mis/po/${S.poId}`);
    await owner.getByRole('button', { name: 'Approve' }).click();
    await expect(vis(owner.getByText('APPROVED', { exact: true }))).toBeVisible({ timeout: 15000 });
    await owner.context().close();
  }
});

test('3 STORE_GUY: receives 90/100 with 4 damaged on a GRN; Owner and Admin bells ring live; home cards list it', async ({ browser }) => {
  test.setTimeout(180000);
  // Both office contexts are open and subscribed BEFORE the confirm.
  const { page: owner, before: ownerBefore } = await openBell(browser, 'OWNER');
  const { page: admin, before: adminBefore } = await openBell(browser, 'ADMIN');

  const store = await open(browser, 'STORE_GUY', '/mis/grn');
  await vis(store.getByRole('button', { name: '+ New GRN' })).click();
  const dlg = store.getByRole('dialog', { name: 'New GRN' });
  const poOption = await dlg.locator('option', { hasText: S.poNo }).getAttribute('value');
  await dlg.getByLabel('Purchase Order', { exact: true }).selectOption(poOption!);
  await dlg.getByLabel('Notes', { exact: true }).fill(`E2E-flow ${TS}`);
  await dlg.getByRole('button', { name: 'Create GRN' }).click();
  await store.waitForURL(/\/mis\/grn\/[0-9a-f-]{36}$/, { timeout: 20000 });
  S.grnId = idFromUrl(store.url());
  S.grnNo = ((await store.locator('h1').first().textContent()) ?? '').trim();
  expect(S.grnNo).toMatch(/^GRN-/);

  await expect(vis(store.getByText('Delivery paperwork'))).toBeVisible();
  await expect(store.getByLabel(/Supplier Invoice Amount/)).toHaveCount(0);
  await vis(store.getByLabel('Supplier Invoice No', { exact: true })).fill(S.invoiceNo);
  await vis(store.getByLabel('DC Number', { exact: true })).fill('E2E-DC');
  await vis(store.getByRole('button', { name: 'Save paperwork' })).click();
  await expect(vis(store.getByText('Saved', { exact: true }))).toBeVisible({ timeout: 15000 });

  await vis(store.getByLabel('PO Line Item', { exact: true })).selectOption({ label: `${S.itemName} (Ordered: 100)` });
  await vis(store.getByLabel('Received Qty (good)')).fill('90');
  await vis(store.getByLabel('DC Qty (challan)')).fill('100');
  await vis(store.getByLabel('Damaged Qty')).fill('4');
  await vis(store.getByRole('button', { name: 'Add Item', exact: true })).click();
  await expect(vis(store.getByText('Short: 6'))).toBeVisible({ timeout: 15000 });
  await expect(vis(store.getByText('Damaged: 4'))).toBeVisible();

  store.once('dialog', (d) => void d.accept());
  await vis(store.getByRole('button', { name: 'Confirm GRN' })).click();
  // One transaction per line plus the alert fan-out: seen to take 20 s+ on a cold Vercel function.
  await expect(vis(store.getByText('CONFIRMED', { exact: true }))).toBeVisible({ timeout: 60000 });

  // The store context stays open until both checks are done: closing it would bring another window
  // to the front, and the bell also refetches on visibilitychange — that would not be a push.
  const title = `${S.grnNo} received · ${S.poNo}`;
  await recordPush(owner, 'OWNER', ownerBefore, title);
  await recordPush(admin, 'ADMIN', adminBefore, title);
  await store.context().close();

  await owner.goto('/mis');
  await expect(vis(owner.getByText('Needs attention'))).toBeVisible();
  await expect(vis(owner.getByText(title))).toBeVisible();
  await admin.goto('/mis');
  await expect(vis(admin.getByText('Deliveries received'))).toBeVisible();
  await expect(vis(admin.getByText(`${S.grnNo} · ${S.poNo}`))).toBeVisible();
  await owner.context().close();
  await admin.context().close();
});

test('4 OWNER / STORE_GUY: the PO shows the 3-way match (100 / 90 / 4 / 6 / 10); rupee tiles wait for an amount', async ({ browser }) => {
  for (const role of ['OWNER', 'STORE_GUY'] as const) {
    const page = await open(browser, role, `/mis/po/${S.poId}`);
    await expect(vis(page.getByText('3-way match'))).toBeVisible();
    const table = page.locator('table').filter({ hasText: 'Outstanding' }).first();
    await expect(table.locator('tr').filter({ hasText: S.itemName }).first().locator('td')).toHaveText([S.itemName, '100', '90', '4', '6', '10']);
    await expect(table.locator('tr').filter({ hasText: 'Total' }).locator('td')).toHaveText(['Total', '100', '90', '4', '6', '10']);
    await expect(vis(page.getByText(`Invoices: ${S.invoiceNo} (${S.grnNo})`))).toBeVisible();
    await expect(page.getByText('PO value')).toHaveCount(0);
    await expect(page.getByText('Received value')).toHaveCount(0);
    if (role === 'OWNER') await expect(vis(page.getByText('Invoice amount not entered yet'))).toBeVisible();
    else await expect(page.getByText('₹')).toHaveCount(0);
    await page.context().close();
  }
});

test('5 ADMIN: the order shows 90 allocated and left', async ({ browser }) => {
  const page = await open(browser, 'ADMIN', `/mis/orders/${S.orderId}`);
  await expect(vis(page.getByText('Stock allocated to this order'))).toBeVisible();
  await expect(vis(page.getByText(new RegExp(`^90 ${S.unit} left$`)))).toBeVisible();
  await page.context().close();
});

test('6 STORE_GUY: issues 60 against the order, is refused 31, issues 30; the order shows 0 left', async ({ browser }) => {
  test.setTimeout(120000);
  const page = await open(browser, 'STORE_GUY', '/mis/store/issue');
  await vis(page.getByRole('button', { name: S.orderNo })).click();
  await expect(vis(page.getByText('Allocated to this order'))).toBeVisible();
  await expect(vis(page.getByText(`90 ${S.unit} left`))).toBeVisible();

  const confirm = vis(page.getByRole('button', { name: 'Confirm issue' }));
  await cartAdd(page, '60');
  await confirm.click();
  await expect(vis(page.getByText('1 line · 60 total qty went to the floor.'))).toBeVisible({ timeout: 20000 });

  await cartAdd(page, '31');
  await confirm.click();
  const refusal = vis(page.locator('section').filter({ hasText: 'Not saved' }));
  await expect(refusal).toBeVisible({ timeout: 20000 });
  await recordRefusal('issue 31 on /mis/store/issue (store.ts#commitIssue via store/actions.ts#commitIssueAction)', refusal);
  await expect(page.getByText('31 total qty went to the floor')).toHaveCount(0);

  // The refused line stays in the cart: lower it and go again.
  await vis(page.getByLabel(`Quantity of ${S.itemName} in ${S.unit}`)).fill('30');
  await confirm.click();
  await expect(vis(page.getByText('1 line · 30 total qty went to the floor.'))).toBeVisible({ timeout: 20000 });
  await page.context().close();

  const admin = await open(browser, 'ADMIN', `/mis/orders/${S.orderId}`);
  await expect(vis(admin.getByText(new RegExp(`^0 ${S.unit} left$`)))).toBeVisible();
  await admin.context().close();
});

/** Supervisor's request cart → MRN number. `onOrder` picks the chain's order; otherwise General / overhead. */
async function sendRequest(page: Page, onOrder: boolean): Promise<string> {
  await expect(vis(page.getByText('Request material'))).toBeVisible();
  if (onOrder) await vis(page.getByRole('button', { name: S.orderNo })).click();
  await cartAdd(page, '5');
  await vis(page.getByRole('button', { name: 'Send request' })).click();
  const ok = vis(page.getByText('is waiting for the Store'));
  await expect(ok).toBeVisible({ timeout: 20000 });
  const mrn = ((await ok.locator('span').first().textContent()) ?? '').trim();
  expect(mrn).toMatch(/^MRN-/);
  return mrn;
}

test('7 SUPERVISOR: requests 5 against the order; the Store Guy bell rings live', async ({ browser }) => {
  const { page: store, before } = await openBell(browser, 'STORE_GUY');

  const sup = await open(browser, 'SUPERVISOR', '/mis/store/requests/new');
  S.mrn1 = await sendRequest(sup, true);

  await recordPush(store, 'STORE_GUY', before, `${S.mrn1} · material requested`);
  await sup.context().close();
  await store.context().close();
});

test('8 STORE_GUY: 6 is refused on the form; approving 3 against the exhausted allocation is refused by the cap; a general request approves', async ({ browser }) => {
  test.setTimeout(120000);
  const page = await open(browser, 'STORE_GUY', '/mis/store/requests');
  await vis(page.getByText(S.mrn1)).click();
  await expect(vis(page.getByText('PENDING'))).toBeVisible();
  const qty = vis(page.getByLabel('Issue qty (max 5)'));
  const approve = vis(page.getByRole('button', { name: 'Approve & issue' }));
  await qty.fill('6');
  await expect(vis(page.getByText('Cannot issue more than 5'))).toBeVisible();
  await expect(approve).toBeDisabled();
  await qty.fill('3');
  await expect(approve).toBeEnabled();
  // Step 6 spent the whole 90 earmark, and approval issues through commitIssue with the same cap
  // (material-request.ts#approveMaterialRequest), so this must be refused and the note re-opened.
  await approve.click();
  const err = vis(page.locator('p.text-red-600'));
  await expect(err).toBeVisible({ timeout: 20000 });
  await recordRefusal('approve 3 on /mis/store/requests/[id] (material-request.ts#approveMaterialRequest via requests/actions.ts)', err);
  await expect(vis(page.getByText('PENDING'))).toBeVisible();
  await expect(approve).toBeVisible();
  // Tidy: reject it with an E2E- note so no PENDING note lingers on the live list.
  await vis(page.getByLabel('Note (required to reject)')).fill(`E2E-flow ${TS} cap check`);
  await vis(page.getByRole('button', { name: 'Reject', exact: true })).click();
  await expect(vis(page.getByText('REJECTED'))).toBeVisible({ timeout: 20000 });
  await page.context().close();

  const sup = await open(browser, 'SUPERVISOR', '/mis/store/requests/new');
  S.mrn2 = await sendRequest(sup, false);
  await sup.context().close();

  const store = await open(browser, 'STORE_GUY', '/mis/store/requests');
  await vis(store.getByText(S.mrn2)).click();
  const qty2 = vis(store.getByLabel('Issue qty (max 5)'));
  const approve2 = vis(store.getByRole('button', { name: 'Approve & issue' }));
  await qty2.fill('6');
  await expect(vis(store.getByText('Cannot issue more than 5'))).toBeVisible();
  await expect(approve2).toBeDisabled();
  await qty2.fill('3');
  await vis(store.getByLabel('Note (required to reject)')).fill(`E2E-flow ${TS}`);
  await approve2.click();
  await expect(vis(store.getByText('APPROVED'))).toBeVisible({ timeout: 20000 });
  await store.reload();
  await expect(vis(store.getByText('APPROVED'))).toBeVisible();
  await expect(vis(store.getByText('Issued 3'))).toBeVisible();
  await expect(store.getByRole('button', { name: 'Approve & issue' })).toHaveCount(0);
  await expect(store.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
  await store.context().close();
});

test('9 records created, cleanup SQL appended', async () => {
  const ended = new Date();
  const mrns = [S.mrn1, S.mrn2].filter(Boolean).map((m) => `'${m}'`).join(',');
  const sql = `
-- v2-flows run ${TS} (${STARTED.toISOString()} → ${ended.toISOString()}):
--   ${S.orderNo} · ${S.poNo} · ${S.grnNo} · ${S.invoiceNo} · ${[S.mrn1, S.mrn2].filter(Boolean).join(' · ')} · item ${S.itemCode}
BEGIN;
DELETE FROM notifications WHERE payload->>'grnNumber' = '${S.grnNo}' OR payload->>'requestNumber' IN (${mrns || "''"});
DELETE FROM mis_material_request_lines WHERE request_id IN (SELECT id FROM mis_material_requests WHERE request_number IN (${mrns || "''"}));
DELETE FROM mis_material_requests WHERE request_number IN (${mrns || "''"});
DELETE FROM mis_store_transactions WHERE reference_no = '${S.orderNo}'${[S.mrn1, S.mrn2].filter(Boolean).map((m) => ` OR reason LIKE '${m}%'`).join('')};
DELETE FROM mis_inventory_ledger
 WHERE source_id IN (SELECT id::text FROM mis_orders WHERE order_number = '${S.orderNo}')
    OR source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = '${S.grnNo}')
    OR (source = 'STORE_ISSUE' AND source_id IS NULL AND created_at BETWEEN '${STARTED.toISOString()}' AND '${ended.toISOString()}'
        AND item_id IN (SELECT id FROM mis_items WHERE code = '${S.itemCode}'));
DELETE FROM mis_order_stock_allocations WHERE source_id IN (SELECT id::text FROM mis_grns WHERE grn_number = '${S.grnNo}');
DELETE FROM mis_supplier_invoices WHERE invoice_no = '${S.invoiceNo}';
DELETE FROM mis_grn_items WHERE grn_id IN (SELECT id FROM mis_grns WHERE grn_number = '${S.grnNo}');
DELETE FROM mis_grns WHERE grn_number = '${S.grnNo}';
DELETE FROM mis_po_items WHERE po_id IN (SELECT id FROM mis_purchase_orders WHERE po_number = '${S.poNo}');
DELETE FROM mis_purchase_orders WHERE po_number = '${S.poNo}';
DELETE FROM mis_orders WHERE order_number = '${S.orderNo}';
COMMIT;
`;
  appendFileSync(path.join(process.cwd(), 'scripts/e2e-cleanup.sql'), sql);
  // The caller reads this block: what was created, and whether the push reached each role.
  console.log(`[v2-flows ${TS}] created: order ${S.orderNo} (${S.orderId}) · PO ${S.poNo} (${S.poId}) · GRN ${S.grnNo} (${S.grnId}) · invoice ${S.invoiceNo} · requests ${S.mrn1} (rejected), ${S.mrn2} (approved) · item ${S.itemName} [${S.itemCode}] · realtime push: ${JSON.stringify(PUSH)}\n${DIAG.join('\n')}`);
  expect(DEFECTS, 'a refused write tells the person why (server-action errors are masked in production builds)').toEqual([]);
  expect(PUSH, 'the bell count rose live (no reload) for every bell role — notification-bell.tsx postgres_changes channel').toEqual({ OWNER: true, ADMIN: true, STORE_GUY: true });
});
