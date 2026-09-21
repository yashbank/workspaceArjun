/**
 * Phase 24E · D11 — traceability.
 *
 * What a screenshot cannot enforce: that a gap is DRAWN as a gap (all six steps, dashed when empty), that a step this
 * role may not read says so, that there is no "Contained" verdict, that the log is read-only, and that every hop names
 * a person or says the person is not recorded.
 */
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { denied, none, ok, EMPTY_TRACE, type TraceView } from '@/lib/mis/trace';

import { TraceabilityDesktop } from './traceability-desktop';

const events = [
  { atIso: '2026-09-05T03:30:00.000Z', atLabel: '05/09 09:00', kind: 'QC_FAILED' as const, subject: 'Shade', qty: null, unit: null, by: 'S. Kulkarni' },
  { atIso: '2026-09-05T00:50:00.000Z', atLabel: '05/09 06:20', kind: 'ISSUED' as const, subject: 'FBB 300 gsm', qty: 1240, unit: 'KG', by: null },
];
const ORDER: TraceView = {
  ...EMPTY_TRACE('ORD-2026-118', 'order'),
  order: { id: 'o1', orderNumber: 'ORD-2026-118', description: 'Duplex carton', customer: 'Acme', status: 'IN_PRODUCTION', raisedLabel: '28/08 10:00', raisedBy: 'A. Bhaskar', deliveryLabel: '18/09/2026' },
  material: ok([{ name: 'FBB 300 gsm', unit: 'KG', receipts: [{ grnNumber: 'GRN-1', batchNo: 'RM-FBB-4417', qty: 2400, unit: 'KG', receivedLabel: '21/08 09:14', by: 'S. Patil' }] }, { name: 'Ink', unit: 'KG', receipts: [] }]),
  issues: ok([{ itemName: 'FBB 300 gsm', unit: 'KG', qty: 1240, atLabel: '05/09 06:20', by: null, overIssue: false }]),
  phases: ok({ done: 1, total: 3, rows: [{ seq: 1, name: 'Line clearance', status: 'SIGNED_OFF', inCharge: 'R. Kumar', startedLabel: null, startedBy: null, signedLabel: '05/09 06:30', signedBy: 'R. Kumar' }, { seq: 2, name: 'Printing', status: 'IN_PROGRESS', inCharge: 'R. Kumar', startedLabel: '05/09 06:40', startedBy: 'R. Kumar', signedLabel: null, signedBy: null }] }),
  qc: ok({ taken: 8, pass: 7, fail: 1, makeready: 0, failures: [{ id: 'c1', parameter: 'Shade', atLabel: '05/09 09:00', defectType: 'major', by: 'S. Kulkarni', cleared: null, clearedBy: null }] }),
  despatch: { status: 'IN_PRODUCTION' },
  events,
};
const LOT: TraceView = {
  ...EMPTY_TRACE('RM-FBB-4417', 'lot'),
  lot: {
    batchNo: 'RM-FBB-4417',
    receipts: [{ grnNumber: 'GRN-1', poNumber: 'PO-77', supplier: 'Acme Paper', itemName: 'FBB 300 gsm', unit: 'KG', qty: 2400, receivedLabel: '21/08 09:14', by: 'S. Patil' }],
    issuedAfter: ok([{ itemName: 'FBB 300 gsm', unit: 'KG', orders: [{ orderNumber: 'ORD-2026-118', orderId: 'o1', qty: 1240, atLabel: '05/09 06:20' }, { orderNumber: '—', orderId: null, qty: 100, atLabel: '07/09 06:20' }] }]),
  },
  events: [{ atIso: '2026-08-21T03:44:00.000Z', atLabel: '21/08 09:14', kind: 'RECEIVED', subject: 'FBB 300 gsm', qty: 2400, unit: 'KG', by: 'S. Patil' }],
};
const renderView = (v: TraceView) => render(<TraceabilityDesktop view={v} />);

describe('the search', () => {
  it('is a plain GET form that keeps the query, capped at 60 characters', () => {
    const { container } = renderView(ORDER);
    const form = container.querySelector('form[role="search"]')!;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/mis/traceability');
    const input = screen.getByLabelText('Search') as HTMLInputElement;
    expect(input.defaultValue).toBe('ORD-2026-118');
    expect(input.getAttribute('name')).toBe('q');
    expect(input.getAttribute('maxlength')).toBe('60');
    expect(input.className).toContain('min-h-12');
  });

  it('nothing typed explains both ways to search', () => {
    renderView(EMPTY_TRACE('', 'idle'));
    expect(screen.getByText('Search an order or a supplier lot')).toBeTruthy();
  });

  it('no match says so, in a dashed card', () => {
    const { container } = renderView(EMPTY_TRACE('NOPE-1', 'none'));
    expect(screen.getByText('Nothing matches: NOPE-1')).toBeTruthy();
    expect(container.querySelector('section')!.className).toContain('border-dashed');
  });

  it('a role that cannot read receipts is told the lot search is unavailable — not "no match"', () => {
    renderView(EMPTY_TRACE('RM-FBB-4417', 'none', true));
    expect(screen.getByText(/goods receipts, which your role cannot see/)).toBeTruthy();
    expect(screen.queryByText(/No goods receipt has that batch number/)).toBeNull();
  });
});

describe('the order chain — six steps, always', () => {
  it('draws all six steps in order, numbered, for a fully recorded order', () => {
    renderView(ORDER);
    const steps = screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'));
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.textContent!.match(/^\d/)![0])).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(screen.getByText('Chain for order').textContent).toContain('ORD-2026-118');
  });

  it('a step with nothing recorded is DASHED and says so — it is not dropped', () => {
    renderView({ ...ORDER, material: none(), issues: none(), phases: none(), qc: none() });
    const steps = screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'));
    expect(steps).toHaveLength(6);
    for (const i of [0, 1, 3, 4]) expect(steps[i].className).toContain('border-dashed');
    expect(steps[0].textContent).toContain("No goods receipt is recorded for this order's materials.");
    expect(steps[1].textContent).toContain('Nothing issued to this order is recorded.');
    expect(steps[3].textContent).toContain('No phase plan is recorded');
  });

  it('a step this role may not read says "Not visible to your role" — distinct from "nothing recorded"', () => {
    renderView({ ...ORDER, material: denied(), issues: denied() });
    const steps = screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'));
    expect(steps[0].textContent).toContain('Not visible to your role.');
    expect(steps[1].textContent).toContain('Not visible to your role.');
    expect(steps[0].textContent).not.toContain('No goods receipt');
  });

  it('step 6 is ALWAYS a gap: there is no despatch record — with the order status, and no claim about the factory', () => {
    const { container } = renderView({ ...ORDER, despatch: { status: 'DELIVERED' } });
    const six = screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'))[5];
    expect(six.className).toContain('border-dashed');
    expect(six.textContent).toContain('No despatch is recorded.');
    expect(six.textContent).toContain('Order status: DELIVERED');
    expect(container.textContent).not.toMatch(/Contained\.|has not left|nothing made from this material|Every chain stops/); // no verdict sentence
  });

  it('there is NO verdict, and the screen says what the records cannot tell you', () => {
    renderView(ORDER);
    expect(screen.getByText(/What this chain cannot tell you/)).toBeTruthy();
    expect(screen.getByText(/does not conclude that a lot is contained/)).toBeTruthy();
  });

  it('an uncleared QC failure turns step 5 red and says "not cleared"; a cleared one says when', () => {
    renderView(ORDER);
    const five = screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'))[4];
    expect(five.className).toContain('bg-red-50');
    expect(five.textContent).toContain('1 failure');
    expect(five.textContent).toContain('not cleared');
    document.body.innerHTML = '';
    renderView({ ...ORDER, qc: ok({ taken: 8, pass: 8, fail: 1, makeready: 0, failures: [{ id: 'c1', parameter: 'Shade', atLabel: '05/09 09:00', defectType: null, by: 'S. Kulkarni', cleared: '05/09 09:40', clearedBy: 'S. Kulkarni' }] }) });
    const cleared = screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'))[4];
    expect(cleared.className).not.toContain('bg-red-50');
    expect(cleared.textContent).toContain('cleared 05/09 09:40');
  });

  it('phases show how many of how many are signed', () => {
    renderView(ORDER);
    expect(screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'))[3].textContent).toContain('1 of 3');
  });

  it('material is honest that it is item level — in the step AND under the table', () => {
    renderView(ORDER);
    const steps = screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'));
    expect(steps[0].textContent).toContain('the store does not record which lot an issue drew from');
    expect(screen.getByRole('table', { name: /Materials received against/ }).closest('section')!.textContent).toContain('the store does not record which lot an issue drew from');
  });

  it('step 5 says "no failure" when every check passed — and counts one failure as "1 failure", several as "2 failures"', () => {
    const q = (fail: number) => ok({ taken: 8, pass: 8 - fail, fail, makeready: 0, failures: Array.from({ length: fail }, (_, i) => ({ id: `c${i}`, parameter: 'P', atLabel: 'x', defectType: null, by: null, cleared: 'y', clearedBy: null })) });
    renderView({ ...ORDER, qc: q(0) });
    expect(screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'))[4].textContent).toContain('no failure');
    document.body.innerHTML = '';
    renderView({ ...ORDER, qc: q(2) });
    expect(screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'))[4].textContent).toContain('2 failures');
  });

  it('the materials table lists each receipt, and an item with none says "no receipt recorded"', () => {
    renderView(ORDER);
    const table = screen.getByRole('table', { name: /Materials received against/ });
    expect(within(table).getByText('RM-FBB-4417')).toBeTruthy();
    expect(within(table).getByText('S. Patil')).toBeTruthy();
    expect(within(table).getByText('no receipt recorded')).toBeTruthy();
  });
});

describe('every step names its people — each line its own, never another\'s', () => {
  const steps = () => screen.getAllByRole('listitem').filter((li) => li.className.includes('rounded-xl'));

  it('step 1 names who received; step 2 names who issued EACH line, and an unpaired line says so', () => {
    renderView({ ...ORDER, issues: ok([{ itemName: 'FBB', unit: 'KG', qty: 100, atLabel: '05/09 06:20', by: 'R. Kumar', overIssue: false }, { itemName: 'Ink', unit: 'KG', qty: 5, atLabel: '05/09 06:21', by: null, overIssue: false }]) });
    expect(steps()[0].textContent).toContain('S. Patil');
    const [first, second] = within(steps()[1]).getAllByRole('listitem');
    expect(first.textContent).toContain('R. Kumar');
    expect(second.textContent).toContain('person not recorded');
    expect(second.textContent).not.toContain('R. Kumar'); // the unpaired line is not attributed to the first line's person
  });

  it('step 4 names who signed each phase (or who started a running one) — and an in-charge is not shown as if they acted', () => {
    renderView(ORDER);
    const rows = within(steps()[3]).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('05/09 06:30');
    expect(rows[0].textContent).toContain('R. Kumar');
    expect(rows[1].textContent).toContain('05/09 06:40');
    document.body.innerHTML = '';
    renderView({ ...ORDER, phases: ok({ done: 0, total: 1, rows: [{ seq: 1, name: 'Printing', status: 'PENDING', inCharge: 'M. Rao', startedLabel: null, startedBy: null, signedLabel: null, signedBy: null }] }) });
    expect(steps()[3].textContent).not.toContain('M. Rao');
  });

  it('step 5 names who failed each check', () => {
    renderView(ORDER);
    expect(steps()[4].textContent).toContain('S. Kulkarni');
  });

  it('a person the record does not name is italic "person not recorded" wherever it appears', () => {
    renderView({ ...ORDER, qc: ok({ taken: 1, pass: 0, fail: 1, makeready: 0, failures: [{ id: 'c', parameter: 'P', atLabel: 'x', defectType: null, by: null, cleared: null, clearedBy: null }] }) });
    expect(within(steps()[4]).getByText('person not recorded').className).toContain('italic');
  });
});

describe('structure', () => {
  it('step titles are headings; every table has a caption', () => {
    renderView(ORDER);
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBe(6);
    for (const table of document.querySelectorAll('table')) expect(table.querySelector('caption')).not.toBeNull();
  });

  it('the lot view\'s tables have captions too', () => {
    renderView(LOT);
    const tables = document.querySelectorAll('table');
    expect(tables.length).toBe(2);
    for (const table of tables) expect(table.querySelector('caption')).not.toBeNull();
  });

  it('two BOM lines with the same name render without a key collision', () => {
    const errors: unknown[] = [];
    const spy = console.error;
    console.error = (...a: unknown[]) => { errors.push(a); };
    try {
      const dup = { name: 'FBB', unit: 'KG', receipts: [{ grnNumber: 'G', batchNo: 'B', qty: 1, unit: 'KG', receivedLabel: 'x', by: null }, { grnNumber: 'G', batchNo: 'B', qty: 1, unit: 'KG', receivedLabel: 'x', by: null }] };
      renderView({ ...ORDER, material: ok([dup, dup]) });
    } finally {
      console.error = spy;
    }
    expect((errors as unknown[][]).filter((e) => String(e[0]).includes('same key'))).toEqual([]);
  });
});

describe('every hop names a person — or says it does not', () => {
  it('an event with no recorded person says so; it is not blank', () => {
    renderView(ORDER);
    const log = screen.getByRole('heading', { name: 'Event log' }).closest('section')!;
    const rows = within(log).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('S. Kulkarni');
    expect(rows[1].textContent).toContain('person not recorded');
  });
});

describe('the event log is read-only', () => {
  it('is a list of times and words: no form, button, input or link in it', () => {
    renderView(ORDER);
    const log = screen.getByRole('heading', { name: 'Event log' }).closest('section')!;
    expect(log.querySelectorAll('form, button, input, a, textarea, select')).toHaveLength(0);
    expect(log.textContent).toContain('Append-only. Nothing on this screen can be edited from it.');
    expect(log.textContent).toContain('2 events');
  });

  it('carries a machine-readable time, newest first as given', () => {
    renderView(ORDER);
    const times = [...document.querySelectorAll('time')].map((t) => t.getAttribute('datetime'));
    expect(times).toEqual(['2026-09-05T03:30:00.000Z', '2026-09-05T00:50:00.000Z']);
  });

  it('shows quantities with their unit', () => {
    renderView(ORDER);
    expect(screen.getByText(/Issued · FBB 300 gsm · 1,240 KG/)).toBeTruthy();
  });

  it('an empty log says so', () => {
    renderView({ ...ORDER, events: [] });
    expect(screen.getByText('No event is recorded.')).toBeTruthy();
  });

  it('nothing on the whole screen can change a record: the only form is the search', () => {
    const { container } = renderView(ORDER);
    expect(container.querySelectorAll('form')).toHaveLength(1);
    expect(container.querySelectorAll('button[type="submit"]')).toHaveLength(1);
    expect(container.textContent).not.toMatch(/Trace forward|Export chain/);
  });
});

describe('the lot', () => {
  it('lists the receipt with supplier, PO, quantity, time and person', () => {
    renderView(LOT);
    expect(screen.getByText('Lot').textContent).toContain('RM-FBB-4417');
    const t = screen.getByRole('table', { name: 'Receipts of this lot' });
    for (const text of ['GRN-1', 'PO-77', 'Acme Paper', '2,400 KG', '21/08 09:14', 'S. Patil']) expect(t.textContent).toContain(text);
  });

  it('what was issued of the same ITEM afterwards is labelled "may or may not have used it" — never "used this lot"', () => {
    const { container } = renderView(LOT);
    expect(screen.getByText(/may or may not have used it/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/accounted for|used this lot|Contained\./);
  });

  it('an order in that list links back to its own trace; an issue not booked to an order says so', () => {
    renderView(LOT);
    expect(screen.getByRole('link', { name: 'ORD-2026-118' }).getAttribute('href')).toBe('/mis/traceability?q=ORD-2026-118');
    expect(screen.getByText('not booked to an order').className).toContain('italic');
  });

  it('with the store not readable it says so; with nothing issued it says that instead', () => {
    renderView({ ...LOT, lot: { ...LOT.lot!, issuedAfter: denied() } });
    expect(screen.getByText('Not visible to your role.')).toBeTruthy();
    document.body.innerHTML = '';
    renderView({ ...LOT, lot: { ...LOT.lot!, issuedAfter: none() } });
    expect(screen.getByText(/No issue of this item is recorded since the lot arrived/)).toBeTruthy();
  });
});

describe('failure and refusal', () => {
  it('a load failure is an alert with a way to the classic screen', () => {
    render(<TraceabilityDesktop view={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(screen.getByRole('link', { name: 'Open the classic screen' }).getAttribute('href')).toBe('/mis/traceability?view=classic');
  });

  it('a refusal says "no access"', () => {
    render(<TraceabilityDesktop view={null} denied />);
    expect(screen.getByRole('alert').textContent).toBe('You do not have access to traceability.');
  });
});

describe('the page and the source', () => {
  const root = process.cwd();
  const page = readFileSync(path.join(root, 'src/app/(mis)/mis/traceability/page.tsx'), 'utf8');
  const src = readFileSync(path.join(root, 'src/components/mis/desktop/traceability-desktop.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('two layouts, and any explicit ?view is the existing screen', () => {
    expect(page).toContain('className="lg:hidden"');
    expect(page).toContain('className="hidden lg:block"');
    expect(page).toContain('if (sp.view) return phone;');
    expect(page).not.toMatch(/\b(sm|md|xl|2xl):(hidden|block)\b/);
  });

  it('the component imports no server module, submits no action, and does no counting or date arithmetic', () => {
    expect(src).not.toMatch(/from '@\/server/);
    expect(src).not.toMatch(/use server|action=\{[a-z]/);
    expect(src).not.toMatch(/\.reduce\(|new Date\(|getHours|toLocale/);
  });

  it('uses only the lg breakpoint — never a third layout', () => {
    expect(src).toContain('lg:grid-cols-6');
    expect(src).not.toMatch(/['" ](sm|md|xl|2xl):/);
  });

  it('every link and control is a 44px target, and no new hex', () => {
    const { container } = renderView(LOT);
    for (const el of container.querySelectorAll('a, button, input')) expect(el.getAttribute('class') ?? '').toMatch(/min-h-1[12]/);
    const own = (src.match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase());
    const known = new Set(
      ['order-detail-desktop.tsx', 'bom-desktop.tsx', 'defects-desktop.tsx', 'qc-grid-desktop.tsx', 'attendance-month-desktop.tsx', 'machine-timeline-desktop.tsx', 'desktop-shell.tsx'].flatMap((f) =>
        (readFileSync(path.join(root, 'src/components/mis/desktop', f), 'utf8').match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase()),
      ),
    );
    expect(own.filter((h) => !known.has(h))).toEqual([]);
  });

  it('shows no money', () => {
    const { container } = renderView(ORDER);
    expect(container.textContent).not.toMatch(/₹|rupee|price|\brate\b|cost|wage/i);
  });
});
