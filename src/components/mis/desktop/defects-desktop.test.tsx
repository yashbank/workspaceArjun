/**
 * Phase 24D · D14 — defects & rework.
 *
 * What a screenshot cannot enforce: that the 80% cut is a drawn row with a sentence, that severity is only
 * the master's, that nothing the artboard shows but nothing records (disposition, rework time, cost, a rate)
 * is drawn, that machines are labelled as ranked by quantity, that the unknown machine buckets say so, and
 * that no rupee appears for anyone.
 */
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildDefectReport, type Booking, type DefectCheck, type DefectMaster, type DefectReportView } from '@/lib/mis/defects';

import { DefectsDesktop } from './defects-desktop';

const IST = 'Asia/Kolkata';
const at = (iso: string) => new Date(`${iso}+05:30`);
const MASTERS: DefectMaster[] = [
  { id: 'd1', code: 'MISREG', name: 'Mis-registration', severity: 'MAJOR' },
  { id: 'd2', code: 'SHADE', name: 'Shade variation', severity: 'MAJOR' },
  { id: 'd3', code: 'CREASE', name: 'Creasing at fold', severity: 'MINOR' },
  { id: 'd4', code: 'GLUE', name: 'Glue line failure', severity: 'CRITICAL' },
];
let n = 0;
const chk = (when: string, defectType: string | null, defectQty: number | null, over: Partial<DefectCheck> = {}): DefectCheck => {
  n += 1;
  return { id: `c${n}`, orderId: 'o1', orderNumber: 'ORD-118', checkTime: at(when), defectType, defectQty, notes: null, parameterName: 'P', checkerName: 'S. Kulkarni', ...over };
};
const BOOKINGS: Booking[] = [
  { orderId: 'o1', machine: 'Heidelberg SM 74', from: at('2026-08-01T00:00:00'), to: at('2026-08-31T23:00:00') },
  { orderId: 'o2', machine: 'Auto Platen 1', from: at('2026-08-01T00:00:00'), to: at('2026-08-31T23:00:00') },
];
const SHIFTS = [{ name: 'Shift 1', startTime: '06:00', endTime: '15:00' }, { name: 'Shift 2', startTime: '15:00', endTime: '00:00' }];

const CHECKS = [
  chk('2026-08-03T16:00:00', 'Mis-registration', 700),
  chk('2026-08-04T09:00:00', 'Mis-registration', 300),
  chk('2026-08-05T10:00:00', 'Shade variation', 500, { orderId: 'o2', orderNumber: 'ORD-114' }),
  chk('2026-08-06T10:00:00', 'Creasing at fold', 200, { orderId: 'o2', orderNumber: 'ORD-114' }),
  chk('2026-08-07T10:00:00', 'Glue line failure', 100),
  chk('2026-08-08T10:00:00', 'Ink smudge', 60, { orderId: 'ghost', orderNumber: 'ORD-200' }),
  chk('2026-08-09T10:00:00', null, null),
];
const report = buildDefectReport({ checks: CHECKS, masters: MASTERS, bookings: BOOKINGS, shifts: SHIFTS, timeZone: IST, monthKey: '2026-08' });
const view = (over: Partial<DefectReportView> = {}): DefectReportView => ({ ...report, running: false, prevKey: '2026-07', nextKey: '2026-09', currentKey: '2026-09', canWrite: false, ...over });
const renderView = (over: Partial<DefectReportView> = {}) => render(<DefectsDesktop view={view(over)} />);

describe('the header', () => {
  it('names the month, the entries, the quantity as entered, and that every row traces', () => {
    const { container } = renderView();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Defects & rework');
    expect(container.textContent).toContain('August 2026 · 7 entries · 1,860 defective (as entered) · every row traces to an order and a person');
  });

  it('a running month says so', () => {
    const { container } = renderView({ running: true, nextKey: null });
    expect(container.textContent).toContain('running month');
    expect(screen.queryByRole('link', { name: /›/ })).toBeNull();
  });

  it('month links keep the filters; the filters are a plain GET form of what exists', () => {
    const { container } = renderView({ filters: { machine: 'Auto Platen 1', severity: 'MAJOR' } });
    expect(screen.getByRole('link', { name: /‹ Jul/ }).getAttribute('href')).toBe('/mis/qc/defects?month=2026-07&machine=Auto+Platen+1&severity=MAJOR');
    const form = container.querySelector('form')!;
    expect(form.getAttribute('method')).toBe('get');
    expect((form.querySelector('input[name="month"]') as HTMLInputElement).value).toBe('2026-08');
    const machine = screen.getByRole('combobox', { name: 'Machine' }) as HTMLSelectElement;
    expect([...machine.options].map((o) => o.textContent)).toEqual(['Machine: All', 'Auto Platen 1', 'Heidelberg SM 74', 'No booking']);
    expect(machine.value).toBe('Auto Platen 1');
    const severity = screen.getByRole('combobox', { name: 'Severity' }) as HTMLSelectElement;
    expect([...severity.options].map((o) => o.textContent)).toEqual(['Severity: All', 'Critical', 'Major', 'Minor', 'Not classified']);
  });
});

describe('the cards — nothing recorded is nothing shown', () => {
  it('quantity is "as typed": no unit, no rate, no tolerance — and entries without a quantity are named', () => {
    renderView();
    const card = screen.getByRole('heading', { name: 'Defective quantity' }).closest('section')!;
    expect(card.textContent).toContain('1,860');
    expect(card.textContent).toContain('1 entries have no quantity typed');
    expect(card.textContent).toMatch(/no defect rate or tolerance is worked out/);
    expect(card.textContent).not.toMatch(/per 10,000|tolerance \d|under target|%/i);
  });

  it('severity comes from the master; text that matches none is NOT classified, in its own bucket', () => {
    renderView();
    const card = screen.getByRole('heading', { name: 'Where the severity sits' }).closest('section')!;
    const items = within(card).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Critical100', 'Major1,500', 'Minor200', 'Not classified60']);
    expect(card.textContent).toContain('never from the person typing');
  });

  it('the severity bar is proportional: each segment\'s width is that severity\'s share of the quantity', () => {
    renderView();
    const bar = screen.getByRole('img', { name: 'Where the severity sits' });
    const widths = [...bar.children].map((c) => parseFloat((c as HTMLElement).style.width));
    expect(widths).toHaveLength(4);
    expect(widths[0]).toBeCloseTo((100 / 1860) * 100, 3); // critical
    expect(widths[1]).toBeCloseTo((1500 / 1860) * 100, 3); // major
    expect(widths[2]).toBeCloseTo((200 / 1860) * 100, 3); // minor
    expect(widths[3]).toBeCloseTo((60 / 1860) * 100, 3); // not classified
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });

  it('what the artboard shows but nothing records is one dashed card saying so — no disposition, time or cost figure', () => {
    const { container } = renderView({ canWrite: true });
    const card = screen.getByRole('heading', { name: 'Not recorded yet' }).closest('section')!;
    expect(card.className).toContain('border-dashed');
    expect(card.textContent).toContain('reworked, scrapped, accepted with deviation');
    expect(card.textContent).toContain('Rework time');
    expect(card.textContent).toContain('Cost of poor quality');
    expect(container.textContent).not.toMatch(/₹|rupee|Under target|Scrapped \d|Reworked \d/i);
  });
});

describe('the Pareto — sorted, and cut at 80%', () => {
  it('lists reasons largest first with the running share, each with its master severity chip', () => {
    renderView();
    const table = screen.getByRole('table', { name: 'Why it was rejected' });
    const first = within(table).getAllByRole('row')[1]; // row 0 is the header
    expect(first.textContent).toContain('Mis-registration');
    expect(first.textContent).toContain('MAJOR'.toLowerCase().replace('major', 'Major'));
    expect(first.textContent).toContain('1,000');
    expect(first.textContent).toMatch(/53\.8%/); // 1000 of 1860
  });

  it('draws the 80% line as a ROW, with a sentence saying what it means', () => {
    renderView();
    const table = screen.getByRole('table', { name: 'Why it was rejected' });
    const cut = within(table).getByText(/The 80% line\./).closest('tr')!;
    expect(cut.className).toBe('');
    expect(cut.querySelector('td')!.className).toContain('border-dashed');
    expect(cut.textContent).toMatch(/2 reasons out of 6 carry 80\.6% of every defective unit\. Everything below is noise until these are closed\./);
  });

  it('the cut row sits directly after the row that crosses 80%', () => {
    renderView();
    const rows = within(screen.getByRole('table', { name: 'Why it was rejected' })).getAllByRole('row');
    const at = rows.findIndex((r) => r.textContent!.includes('The 80% line.'));
    expect(rows[at - 1].textContent).toContain('Shade variation'); // 1000 + 500 = 1500 of 1860 = 80.6%
    expect(rows[at + 1].textContent).toContain('Creasing at fold');
  });

  it('there is no cut row when the last reason is the one that crosses it', () => {
    const one = buildDefectReport({ checks: [chk('2026-08-03T10:00:00', 'Ink smudge', 5)], masters: MASTERS, bookings: BOOKINGS, shifts: SHIFTS, timeZone: IST, monthKey: '2026-08' });
    renderView({ ...one });
    expect(screen.queryByText(/The 80% line\./)).toBeNull();
  });

  it('a reason with no master is dashed "Not classified"; one with nothing typed says "Not stated" — neither is given a severity', () => {
    renderView();
    const table = screen.getByRole('table', { name: 'Why it was rejected' });
    const smudge = within(table).getByText('Ink smudge').closest('tr')!;
    expect(smudge.textContent).toContain('Not classified');
    expect(smudge.querySelector('th span.inline-block')!.className).toContain('border-dashed');
    expect(within(table).getByText('Not stated')).toBeTruthy();
  });

  it('says so when nothing failed — no empty chart', () => {
    const empty = buildDefectReport({ checks: [], masters: MASTERS, bookings: [], shifts: SHIFTS, timeZone: IST, monthKey: '2026-08' });
    const { container } = renderView({ ...empty });
    expect(screen.getAllByText('No check failed in this month.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('table', { name: 'Why it was rejected' })).toBeNull();
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe('by machine — ranked by quantity, and it says so', () => {
  it('lists machines by quantity, the unknown bucket in its own dashed italic row, with the caveat', () => {
    renderView();
    const card = screen.getByRole('heading', { name: 'Where it happens' }).closest('section')!;
    const rows = within(card).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows[0]).toContain('Heidelberg SM 74');
    expect(rows[0]).toContain('1,100');
    expect(rows.at(-1)).toContain('No booking');
    expect(card.textContent).toContain('Ranked by quantity, not rate');
    expect(card.textContent).toContain('never a guess');
  });

  it('bars share ONE scale: the biggest is full width', () => {
    renderView();
    const bars = screen.getAllByRole('img', { name: /Heidelberg SM 74: 1,100|Auto Platen 1: 700/ }).map((b) => (b.firstElementChild as HTMLElement).style.width);
    expect(bars[0]).toBe('100%');
    expect(parseFloat(bars[1])).toBeCloseTo((700 / 1100) * 100, 1);
  });
});

describe('the drill — three steps, each a share of the one before', () => {
  it('reason → machine → shift with quantities and shares', () => {
    renderView();
    const card = screen.getByRole('heading', { name: 'The biggest reason, traced' }).closest('section')!;
    const steps = within(card).getAllByRole('listitem');
    expect(steps[0].textContent).toContain('Across all machines: Mis-registration');
    expect(steps[0].textContent).toContain('1,000');
    expect(steps[1].textContent).toContain('Of those, on Heidelberg SM 74');
    expect(steps[1].textContent).toContain('100.0% of the step before'.replace('100.0%', '100%'));
    expect(steps[2].textContent).toContain('Of those, in Shift 2');
    expect(steps[2].textContent).toContain('70% of the step before');
  });

  it('with no machine to name it stops at step two and says why', () => {
    const only = buildDefectReport({ checks: [chk('2026-08-03T10:00:00', 'Ink smudge', 9, { orderId: 'ghost' })], masters: MASTERS, bookings: [], shifts: SHIFTS, timeZone: IST, monthKey: '2026-08' });
    renderView({ ...only });
    expect(screen.getByText(/No machine can be named/)).toBeTruthy();
    expect(screen.queryByText(/Of those, in/)).toBeNull();
  });

  it('no failures → no drill card', () => {
    const empty = buildDefectReport({ checks: [], masters: MASTERS, bookings: [], shifts: SHIFTS, timeZone: IST, monthKey: '2026-08' });
    renderView({ ...empty });
    expect(screen.queryByRole('heading', { name: 'The biggest reason, traced' })).toBeNull();
  });
});

describe('the log', () => {
  it('is most recent first; each row traces to an order (a link), a machine, a defect, its severity, a quantity and a person', () => {
    renderView();
    const table = screen.getByRole('table', { name: 'Defect log' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(7);
    expect(rows[0].textContent).toContain('09/08 10:00');
    const glue = within(table).getByText('Glue line failure').closest('tr')!;
    expect(within(glue).getByRole('link', { name: 'ORD-118' }).getAttribute('href')).toBe('/mis/orders/o1');
    expect(glue.textContent).toContain('Critical');
    expect(glue.textContent).toContain('S. Kulkarni');
  });

  it('a check with no quantity or reason shows a dash and "Not stated" — not 0', () => {
    renderView();
    const row = within(screen.getByRole('table', { name: 'Defect log' })).getAllByRole('row')[1];
    expect(row.textContent).toContain('Not stated');
    expect(row.textContent).toContain('—');
  });

  it('has no disposition or batch column, and says they are not recorded', () => {
    renderView();
    const heads = [...screen.getByRole('table', { name: 'Defect log' }).querySelectorAll('thead th')].map((h) => h.textContent);
    expect(heads).toEqual(['Date', 'Order', 'Machine', 'Defect type', 'Severity', 'Qty', 'Logged by']);
    expect(screen.getByText(/Disposition and batch are not recorded/)).toBeTruthy();
  });

  it('says how many are shown of how many', () => {
    const { container } = renderView({ logTotal: 40 });
    expect(container.textContent).toContain('showing 7 of 40');
  });
});

describe('filters are visible, and never lie', () => {
  it('an active filter is announced with a way to clear it, keeping the month', () => {
    renderView({ filters: { machine: 'Auto Platen 1', severity: 'MAJOR' } });
    const note = screen.getByRole('status');
    expect(note.textContent).toContain('Showing a filtered view · Machine: Auto Platen 1 · Severity: Major');
    expect(within(note).getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe('/mis/qc/defects?month=2026-08');
  });

  it('no filter, no notice', () => {
    renderView();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a filter with no rows this month is "no match", NOT "no check failed" — and the select still shows the filter', () => {
    const none = buildDefectReport({ checks: CHECKS, masters: MASTERS, bookings: BOOKINGS, shifts: SHIFTS, timeZone: IST, monthKey: '2026-09', filters: { machine: 'Auto Platen 1' } });
    const { container } = renderView({ ...none, filters: { machine: 'Auto Platen 1', severity: null } });
    expect(screen.getAllByText('No failed check matches these filters this month.').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('No check failed in this month.');
    const select = screen.getByRole('combobox', { name: 'Machine' }) as HTMLSelectElement;
    expect(select.value).toBe('Auto Platen 1');
    expect([...select.options].map((o) => o.textContent)).toContain('Auto Platen 1');
  });

  it('with a machine filter the drill says "Within <machine>", not "Across all machines"', () => {
    const filtered = buildDefectReport({ checks: CHECKS, masters: MASTERS, bookings: BOOKINGS, shifts: SHIFTS, timeZone: IST, monthKey: '2026-08', filters: { machine: 'Heidelberg SM 74' } });
    renderView({ ...filtered });
    const card = screen.getByRole('heading', { name: 'The biggest reason, traced' }).closest('section')!;
    expect(card.textContent).toContain('Within Heidelberg SM 74: Mis-registration');
    expect(card.textContent).not.toContain('Across all machines');
  });

  it('with no machine filter it still says "Across all machines"', () => {
    renderView();
    expect(screen.getByText(/Across all machines/)).toBeTruthy();
  });
});

describe('the Pareto is a labelled table', () => {
  it('has column headers, including the cumulative share, and the top-three share comes from the view', () => {
    renderView();
    const table = screen.getByRole('table', { name: 'Why it was rejected' });
    expect([...table.querySelectorAll('thead th')].map((h) => h.textContent)).toEqual(['Reason', 'Share of the largest reason', 'Qty', 'Cumulative']);
    expect(screen.getByText('Top 3 = 91.4%')).toBeTruthy(); // 1000 + 500 + 200 of 1860
  });

  it('shows no "Top 3" when there are three reasons or fewer', () => {
    const three = buildDefectReport({ checks: CHECKS.slice(0, 3), masters: MASTERS, bookings: BOOKINGS, shifts: SHIFTS, timeZone: IST, monthKey: '2026-08' });
    renderView({ ...three });
    expect(screen.queryByText(/Top 3/)).toBeNull();
  });
});

describe('failure and refusal', () => {
  it('a load failure is an alert with a way to the check screen', () => {
    render(<DefectsDesktop view={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(screen.getByRole('link', { name: 'Open the check screen' }).getAttribute('href')).toBe('/mis/qc');
  });

  it('a refusal says "no access", not "could not load"', () => {
    render(<DefectsDesktop view={null} denied />);
    expect(screen.getByRole('alert').textContent).toBe('You do not have access to the quality checks.');
  });
});

describe('the page and the source', () => {
  const page = readFileSync(path.join(process.cwd(), 'src/app/(mis)/mis/qc/defects/page.tsx'), 'utf8');
  const src = readFileSync(path.join(process.cwd(), 'src/components/mis/desktop/defects-desktop.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('two layouts: the phone quality screen is hidden from 1024px up and D14 below it; nothing else', () => {
    expect(page).toContain('className="lg:hidden"');
    expect(page).toContain('className="hidden lg:block"');
    expect(page).not.toMatch(/\b(sm|md|xl|2xl):(hidden|block)\b/);
  });

  it('a failing desktop query is logged and cannot take the phone screen down; a refusal is "no access"', () => {
    expect(page).toMatch(/try \{[\s\S]*getDefectReport[\s\S]*\} catch \(error\) \{[\s\S]*console\.error/);
    expect(page).toContain('isMisForbiddenError(error)');
  });

  it('the component imports no server module and does no counting, sorting or percentage of its own', () => {
    expect(src).not.toMatch(/from '@\/server/);
    expect(src).not.toMatch(/\.reduce\(|\.sort\(|\.slice\(0, 3\)|\/ view\.quantity|\/ r\.qty/);
  });

  it('uses only the lg breakpoint — never a third layout', () => {
    expect(src).toContain('lg:grid-cols-');
    expect(src).not.toMatch(/['" ](sm|md|xl|2xl):/);
  });

  it('adds no colour of its own: every hex is one the other desktop screens already use', () => {
    const own = (readFileSync(path.join(process.cwd(), 'src/components/mis/desktop/defects-desktop.tsx'), 'utf8').match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase());
    const known = new Set(
      ['order-detail-desktop.tsx', 'machine-timeline-desktop.tsx', 'bom-desktop.tsx', 'wastage-desktop.tsx', 'attendance-month-desktop.tsx', 'qc-grid-desktop.tsx', 'desktop-shell.tsx'].flatMap((f) =>
        (readFileSync(path.join(process.cwd(), 'src/components/mis/desktop', f), 'utf8').match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase()),
      ),
    );
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((h) => !known.has(h))).toEqual([]);
  });

  it('every link and control is a 44px target', () => {
    const { container } = renderView({ canWrite: true });
    for (const el of container.querySelectorAll('a, select, button')) expect(el.getAttribute('class') ?? '').toMatch(/min-h-11/);
  });

  it('shows no money for anyone — the cost card is a "not recorded" line, not a figure', () => {
    const { container } = renderView({ canWrite: true });
    expect(container.textContent).not.toMatch(/₹|rupee|price|wage/i);
    expect(container.textContent).not.toMatch(/cost[^a-z]{0,12}\d/i); // no figure beside the word cost
  });
});
