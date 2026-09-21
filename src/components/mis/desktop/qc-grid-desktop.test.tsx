/**
 * Phase 24D · D9 — the QC hourly grid.
 *
 * What a screenshot cannot enforce: that DASHED (nothing recorded) is distinct from GREY (a recorded
 * make-ready), that a missing check is never drawn as a pass, that the footer is the sum of the cells,
 * that a failure says whether it was cleared, that the AQL limits reach only a role that may see them,
 * and that every cell is a 44px target.
 */
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildQcGrid, type GridOrder, type QcAqlPanel, type QcCheckInput, type QcGridView } from '@/lib/mis/qc-grid';

import { QcGridDesktop } from './qc-grid-desktop';

const DAY = '2026-09-05';
const ist = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+05:30`);
let n = 0;
const check = (at: string, over: Partial<QcCheckInput> = {}): QcCheckInput => {
  n += 1;
  return { id: `c${n}`, orderId: 'o1', bomStageId: null, parameterName: 'Shade', result: 'PASS', defectType: null, defectQty: null, notes: null, checkTime: ist(at), ...over };
};
const ORDERS: GridOrder[] = [
  { id: 'o1', orderNumber: 'ORD-118', description: 'Duplex carton', machines: ['Heidelberg SM 74'] },
  { id: 'o2', orderNumber: 'ORD-117', description: 'Mono carton', machines: [] },
];
const CHECKS = [
  ...[6, 7, 8, 10, 11, 12, 13, 14].map((h) => check(`${String(h).padStart(2, '0')}:15`)),
  check('09:10', { result: 'FAIL', defectType: 'Shade', notes: 'Brand spot off' }),
  check('09:40'),
  check('06:20', { orderId: 'o2' }),
  check('07:20', { orderId: 'o2', result: 'NA' }),
];
const grid = buildQcGrid({ orders: ORDERS, checks: CHECKS, shift: { startTime: '06:00', endTime: '15:00' }, dateKey: DAY, timeZone: 'Asia/Kolkata', now: ist('16:00') });

const AQL_LIMITS: QcAqlPanel = {
  orderNumber: 'ORD-118', decision: 'ACCEPT', sampleSize: 500, timeLabel: '10:20',
  limits: { sampleSizeRequired: 500, sampleSizeMet: true, breakdown: [{ severity: 'CRITICAL', found: 0, max: 0, exceeded: false }, { severity: 'MAJOR', found: 1, max: 2, exceeded: false }, { severity: 'MINOR', found: 3, max: 2, exceeded: true }] },
};
const { limits: _limits, ...AQL_PLAIN } = AQL_LIMITS;
void _limits;

const view = (over: Partial<QcGridView> = {}): QcGridView => ({
  shifts: [{ id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '15:00' }],
  shift: { id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '15:00' },
  dateKey: DAY, todayKey: DAY, status: 'closed', grid, aql: null, canWrite: false, ...over,
});
const renderView = (over: Partial<QcGridView> = {}) => render(<QcGridDesktop view={view(over)} />);

describe('the header', () => {
  it('names the day, the shift window, the lines and how many checks were taken of how many slots', () => {
    const { container } = renderView();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hourly checks');
    expect(container.textContent).toContain('Saturday, 5 September 2026 · Shift 1, 06:00–15:00 · 2 lines · 11 of 18 checks taken');
    expect(screen.getByText('Shift closed')).toBeTruthy();
  });

  it('shift and day are a plain GET form', () => {
    const { container } = renderView();
    const form = container.querySelector('form')!;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/mis/qc/grid');
    expect((screen.getByLabelText('Date') as HTMLInputElement).max).toBe(DAY);
    expect((screen.getByRole('combobox', { name: 'Shift' }) as HTMLSelectElement).value).toBe('s1');
  });

  it('"Record a check" exists only for a role that may write — absent, not greyed', () => {
    renderView({ canWrite: true });
    expect(screen.getByRole('link', { name: 'Record a check' }).getAttribute('href')).toBe('/mis/qc/grid?view=capture');
  });

  it('...and there is no such link otherwise', () => {
    renderView({ canWrite: false });
    expect(screen.queryByRole('link', { name: 'Record a check' })).toBeNull();
  });

  it('with no shift set up it says so instead of drawing an empty grid', () => {
    const { container } = renderView({ shift: null, dateKey: null, status: null, grid: null, shifts: [] });
    expect(screen.getByText(/No shift is set up/)).toBeTruthy();
    expect(container.querySelector('table')).toBeNull();
  });
});

describe('the grid — three recorded states, two honest absences', () => {
  it('one column per hour of the shift, labelled from it', () => {
    renderView();
    const heads = [...document.querySelectorAll('thead th')].map((h) => h.textContent);
    expect(heads.slice(1, 10)).toEqual(['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00']);
    expect(screen.getByRole('heading', { name: '9 hours, 2 lines' })).toBeTruthy();
  });

  it('every cell is a link to that order\'s QC screen, naming line, hour and state', () => {
    renderView();
    const c = screen.getByRole('link', { name: 'ORD-118, 09:00: Failed' });
    expect(c.getAttribute('href')).toBe('/mis/qc/o1');
    expect(c.textContent).toBe('✕');
  });

  it('a slot with nothing recorded is dashed; a recorded make-ready is grey; they never share a style', () => {
    renderView();
    const never = screen.getByRole('link', { name: 'ORD-117, 08:00: Not taken · nothing recorded' });
    const makeready = screen.getByRole('link', { name: 'ORD-117, 07:00: Make-ready · recorded, nothing to judge' });
    expect(never.className).toContain('border-dashed');
    expect(never.className).not.toContain('bg-slate-200');
    expect(makeready.className).toContain('bg-slate-200');
    expect(makeready.className).not.toContain('border-dashed');
    expect(makeready.textContent).toBe('N/A');
    expect(never.textContent).toBe(''); // a missing check carries no tick
  });

  it('a failed cell is red-bordered and carries a cross, not colour alone', () => {
    renderView();
    const f = screen.getByRole('link', { name: 'ORD-118, 09:00: Failed' });
    expect(f.className).toContain('border-red-600');
    expect(f.textContent).toBe('✕');
  });

  it('while a shift is running, an hour still ahead is "not due yet" — not missed', () => {
    const running = buildQcGrid({ orders: ORDERS, checks: CHECKS.slice(0, 2), shift: { startTime: '06:00', endTime: '15:00' }, dateKey: DAY, timeZone: 'Asia/Kolkata', now: ist('08:30') });
    renderView({ grid: running, status: 'running' });
    const upcoming = screen.getByRole('link', { name: 'ORD-118, 14:00: Not due yet' });
    expect(upcoming.className).not.toContain('border-dashed');
    expect(screen.getByText('Shift running')).toBeTruthy();
  });

  it('row totals are Taken and Failed; the footer is the sum', () => {
    const { container } = renderView();
    const row = screen.getByRole('link', { name: 'ORD-118, 06:00: Passed' }).closest('tr')!;
    expect([...row.querySelectorAll('td')].slice(-2).map((td) => td.textContent)).toEqual(['9', '1']);
    const foot = container.querySelector('tfoot')!;
    expect(foot.textContent).toContain('2 lines · Shift 1');
    expect([...foot.querySelectorAll('td')].slice(-2).map((td) => td.textContent)).toEqual(['11', '1']);
  });

  it('the sentence says how the slots add up, in words', () => {
    const { container } = renderView();
    expect(container.textContent).toContain('18 slots = 2 lines × 9 hours · 9 passed + 1 failed + 1 make-ready + 7 not taken');
    const t = grid.totals;
    expect(t.pass + t.fail + t.makeready + t.never + t.upcoming).toBe(t.slots);
  });

  it('a broken identity is announced', () => {
    renderView({ grid: { ...grid, identityHolds: false } });
    expect(screen.getByRole('alert').textContent).toMatch(/do not add up/);
  });

  it('no running line is an empty state, not an empty table', () => {
    const empty = buildQcGrid({ orders: [], checks: [], shift: { startTime: '06:00', endTime: '15:00' }, dateKey: DAY, timeZone: 'Asia/Kolkata', now: ist('16:00') });
    const { container } = renderView({ grid: empty });
    expect(screen.getByText(/No line is running/)).toBeTruthy();
    expect(container.querySelector('table')).toBeNull();
  });

  it('every cell is at least 44px square', () => {
    const { container } = renderView({ canWrite: true });
    for (const a of container.querySelectorAll('tbody a')) expect(a.getAttribute('class')).toMatch(/min-h-11.*min-w-11|min-w-11.*min-h-11/);
    for (const el of container.querySelectorAll('select, input, button')) expect(el.getAttribute('class') ?? '').toMatch(/min-h-11/);
  });

  it('the legend names every state that is drawn, in words', () => {
    renderView();
    const legend = screen.getAllByRole('list')[0];
    expect([...legend.querySelectorAll('li')].map((li) => li.textContent!.replace(/^[✓✕]/, ''))).toEqual([
      'Passed', 'Failed', 'Make-ready · recorded, nothing to judge', 'Not taken · nothing recorded',
    ]);
  });
});

describe('a line that was not running is not "missed"', () => {
  it('a not-running hour is plain — neither dashed nor upcoming — and the legend and sentence name it', () => {
    const g = buildQcGrid({
      orders: [{ ...ORDERS[0], runs: [{ from: 14 * 60, to: 18 * 60 }] }],
      checks: [check('14:20')], shift: { startTime: '06:00', endTime: '15:00' }, dateKey: DAY, timeZone: 'Asia/Kolkata', now: ist('16:00'),
    });
    const { container } = renderView({ grid: g });
    const off = screen.getByRole('link', { name: 'ORD-118, 06:00: Not running · nothing was due' });
    expect(off.className).not.toContain('border-dashed');
    expect(off.className).toContain('bg-transparent');
    expect(container.textContent).toContain('+ 8 not running');
    expect(screen.getAllByRole('list')[0].textContent).toContain('Not running · nothing was due');
    expect(container.textContent).not.toContain('Never taken');
  });

  it('with every line running the legend has no such entry', () => {
    renderView();
    expect(screen.getAllByRole('list')[0].textContent).not.toContain('Not running');
  });
});

describe('a refusal is not a failure', () => {
  it('a denied caller is told they have no access — not "could not be loaded"', () => {
    render(<QcGridDesktop view={null} denied />);
    expect(screen.getByRole('alert').textContent).toBe('You do not have access to the quality checks.');
  });
});

describe('failures carry their clearance', () => {
  it('says "cleared hh:mm" for a failure a later pass resolved, and "not cleared" for one that was not', () => {
    const g = buildQcGrid({
      orders: ORDERS,
      checks: [check('09:10', { result: 'FAIL', notes: 'Spot off' }), check('09:40'), check('11:10', { orderId: 'o2', result: 'FAIL', parameterName: 'Creasing' })],
      shift: { startTime: '06:00', endTime: '15:00' }, dateKey: DAY, timeZone: 'Asia/Kolkata', now: ist('16:00'),
    });
    renderView({ grid: g });
    const card = screen.getByRole('heading', { name: 'Failures this shift' }).closest('section')!;
    const items = within(card).getAllByRole('listitem').filter((li) => li.className.includes('border-red-600'));
    expect(items[0].textContent).toContain('Shade · 09:10 · Heidelberg SM 74');
    expect(items[0].textContent).toContain('cleared 09:40');
    expect(items[1].textContent).toContain('Creasing · 11:10 · ORD-117');
    expect(items[1].textContent).toContain('not cleared');
  });

  it('no failure says so', () => {
    const clean = buildQcGrid({ orders: ORDERS, checks: [check('06:10')], shift: { startTime: '06:00', endTime: '15:00' }, dateKey: DAY, timeZone: 'Asia/Kolkata', now: ist('16:00') });
    renderView({ grid: clean });
    expect(screen.getByText('No check failed in this shift.')).toBeTruthy();
  });

  it('lists the never-taken hours, names the count, and says a missing check is not a pass', () => {
    renderView();
    expect(screen.getByText('Never taken · 7')).toBeTruthy();
    expect(screen.getByText(/A missing check is not a pass/)).toBeTruthy();
  });

  it('shows six missed hours and counts the rest', () => {
    renderView();
    expect(screen.getByText('+1 more')).toBeTruthy();
  });
});

describe('the AQL panel — limits are the Owner\'s (D6)', () => {
  it('a role with aql.read sees the verdict, the sample against the required size, and every limit', () => {
    const { container } = renderView({ aql: AQL_LIMITS });
    const card = screen.getByRole('heading', { name: 'AQL · ORD-118' }).closest('section')!;
    expect(card.textContent).toContain('Accepted');
    expect(card.textContent).toContain('Sample 500 / 500 required · 10:20');
    expect(card.textContent).toContain('1 of 2 allowed');
    expect(card.textContent).toContain('3 of 2 allowed');
    expect(card.textContent).toContain('The limits are the ones in force when this sample was scored.');
    expect(container.textContent).not.toMatch(/40,000/); // orders carry no quantity: no lot size is invented
  });

  it('an over-limit line is drawn as exceeded', () => {
    renderView({ aql: AQL_LIMITS });
    const bars = screen.getAllByRole('img', { name: /\d+ \/ \d+/ });
    expect((bars[2].firstElementChild as HTMLElement).className).toContain('bg-red-400');
    expect((bars[1].firstElementChild as HTMLElement).className).toContain('bg-green-400');
  });

  it('everyone else sees the verdict and the sample ONLY — no limit, no "allowed", no bars', () => {
    const { container } = renderView({ aql: AQL_PLAIN });
    const card = screen.getByRole('heading', { name: 'AQL · ORD-118' }).closest('section')!;
    expect(card.textContent).toContain('Accepted');
    expect(card.textContent).toContain('Sample 500 · 10:20');
    expect(card.textContent).toContain('The limits are visible to the Owner only.');
    expect(card.textContent).not.toMatch(/allowed|required|of \d+|Critical|Major|Minor/);
    expect(container.querySelectorAll('[role="img"]')).toHaveLength(0);
  });

  it('a rejected sample reads Rejected', () => {
    renderView({ aql: { ...AQL_PLAIN, decision: 'REJECT' } });
    expect(screen.getByText('Rejected')).toBeTruthy();
  });

  it('no sample in the shift says so — no invented verdict', () => {
    renderView({ aql: null });
    expect(screen.getByText('No AQL sample was recorded in this shift.')).toBeTruthy();
    expect(screen.queryByText('Accepted')).toBeNull();
  });
});

describe('when the grid could not be loaded', () => {
  it('says so as an alert, with a way to the check screen', () => {
    const { container } = render(<QcGridDesktop view={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(screen.getByRole('link', { name: 'Open the check screen' }).getAttribute('href')).toBe('/mis/qc');
    expect(container.querySelector('table')).toBeNull();
  });
});

describe('the page and the source', () => {
  const page = readFileSync(path.join(process.cwd(), 'src/app/(mis)/mis/qc/grid/page.tsx'), 'utf8');
  const src = readFileSync(path.join(process.cwd(), 'src/components/mis/desktop/qc-grid-desktop.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('two layouts: the capture grid is hidden from 1024px up and D9 below it; nothing else', () => {
    expect(page).toContain('className="lg:hidden"');
    expect(page).toContain('className="hidden lg:block"');
    expect(page).not.toMatch(/\b(sm|md|xl|2xl):(hidden|block)\b/);
  });

  it('any explicit ?view is the capture grid at every width — where a check is recorded', () => {
    expect(page).toMatch(/if \(sp\.view\) return phone;/);
  });

  it('a failing desktop query is logged and cannot take the phone screen down with it', () => {
    expect(page).toMatch(/try \{[\s\S]*getQcHourlyGrid[\s\S]*\} catch \(error\) \{[\s\S]*console\.error/);
    expect(page).toContain('isMisForbiddenError(error)');
  });

  it('the component imports no server module and does no bucketing or counting of its own', () => {
    expect(src).not.toMatch(/from '@\/server/);
    expect(src).not.toMatch(/\.reduce\(|getHours|getUTC|getDay\(|new Date\(\)/);
  });

  it('uses only the lg breakpoint — never a third layout', () => {
    expect(src).toContain('lg:grid-cols-');
    expect(src).not.toMatch(/['" ](sm|md|xl|2xl):/);
  });

  it('shows no money — quality only', () => {
    const { container } = renderView({ aql: AQL_LIMITS, canWrite: true });
    expect(container.textContent).not.toMatch(/₹|rupee|cost|price|wage/i);
  });
});
