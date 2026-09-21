/**
 * Phase 24D · D8 — the attendance month matrix.
 *
 * What a screenshot cannot enforce: that the footer IS the sum of the cells drawn, that "not
 * recorded" is dashed and distinct from a recorded absence, that overtime is a stripe and not a
 * second cell, that the working is shown and a disagreement between recorded and implied overtime is
 * said out loud, and that no weekly off, working-day count or hourly rate is invented.
 */
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildMonthMatrix, dayDetail, type AttendanceMonthView, type MatrixRecord } from '@/lib/mis/attendance-month';

import { AttendanceMonthDesktop } from './attendance-month-desktop';

const rec = (employeeId: string, day: number, status = 'PRESENT', otMinutes = 0): MatrixRecord => ({ employeeId, dateKey: `2026-08-${String(day).padStart(2, '0')}`, status, otMinutes });
const EMPLOYEES = [
  { id: 'e1', name: 'Ramesh Kumar', code: 'BPP-014', department: 'Printing' },
  { id: 'e2', name: 'Suresh Patil', code: 'BPP-027', department: 'Printing' },
];
const RECORDS: MatrixRecord[] = [
  ...Array.from({ length: 24 }, (_, i) => rec('e1', i + 1, 'PRESENT', i === 2 ? 178 : 0)),
  rec('e1', 25, 'ABSENT'),
  ...Array.from({ length: 20 }, (_, i) => rec('e2', i + 1)),
  rec('e2', 21, 'LEAVE'),
  rec('e2', 22, 'HALF_DAY'),
];
const matrix = buildMonthMatrix(EMPLOYEES, RECORDS, [], '2026-08');
const IST = 'Asia/Kolkata';
const punch = (hhmmUtc: string) => new Date(`2026-08-04T${hhmmUtc}:00Z`);

const view = (over: Partial<AttendanceMonthView> = {}): AttendanceMonthView => ({
  monthKey: '2026-08', running: false, prevKey: '2026-07', nextKey: '2026-09', currentKey: '2026-09',
  days: matrix.days, departments: [{ id: 'd1', name: 'Printing' }, { id: 'd2', name: 'Die cutting' }], departmentId: null, departmentName: null,
  rows: matrix.rows.map((r) => ({ id: r.employee.id, name: r.employee.name, code: r.employee.code, department: r.employee.department, cells: r.cells, counts: r.counts })),
  totals: matrix.totals, identityHolds: matrix.identityHolds,
  selected: { id: 'e1', name: 'Ramesh Kumar', code: 'BPP-014', month: { ...matrix.rows[0].counts, days: 31 }, dayKey: null, day: null, dayState: null },
  canPayroll: false,
  ...over,
});
const renderView = (over: Partial<AttendanceMonthView> = {}) => render(<AttendanceMonthDesktop view={view(over)} />);

describe('the header', () => {
  it('names the month, says it is closed, and states the pool', () => {
    const { container } = renderView();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('August 2026');
    expect(container.textContent).toContain('Finished month · 31 days · All departments, 2 workers');
  });

  it('a running month says its figures are incomplete', () => {
    const { container } = renderView({ monthKey: '2026-09', running: true, nextKey: null });
    expect(container.textContent).toContain('Running month — figures are incomplete');
  });

  it('offers the previous month, the running month (labelled), and the day register', () => {
    renderView();
    expect(screen.getByRole('link', { name: /‹ Jul/ }).getAttribute('href')).toBe('/mis/attendance?month=2026-07');
    const next = screen.getByRole('link', { name: /Sep.*running/ });
    expect(next.getAttribute('href')).toBe('/mis/attendance?month=2026-09');
    expect(screen.getByRole('link', { name: 'Day register' }).getAttribute('href')).toBe('/mis/attendance?view=classic');
  });

  it('the running month has no "next"', () => {
    renderView({ monthKey: '2026-09', running: true, nextKey: null });
    expect(screen.queryByRole('link', { name: /›/ })).toBeNull();
  });

  it('the department pool is a plain GET form that keeps the month', () => {
    const { container } = renderView({ departmentId: 'd1', departmentName: 'Printing' });
    const form = container.querySelector('form')!;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/mis/attendance');
    expect((form.querySelector('input[name="month"]') as HTMLInputElement).value).toBe('2026-08');
    const select = screen.getByRole('combobox', { name: 'Department' }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['All departments', 'Printing', 'Die cutting']);
    expect(select.value).toBe('d1');
  });

  it('"Open payroll" exists for the Owner only — absent, not greyed', () => {
    renderView({ canPayroll: true });
    expect(screen.getByRole('link', { name: 'Open payroll' }).getAttribute('href')).toBe('/mis/payroll');
  });

  it('...and there is no payroll link for anyone else', () => {
    renderView({ canPayroll: false });
    expect(screen.queryByRole('link', { name: /payroll/i })).toBeNull();
  });
});

describe('the grid', () => {
  it('has one cell per calendar day per worker, each a link that names the worker, the day and the state', () => {
    renderView();
    const row = screen.getByRole('row', { name: /Ramesh Kumar/ });
    const cells = within(row).getAllByRole('link').filter((a) => a.getAttribute('aria-label')?.startsWith('Ramesh Kumar,'));
    expect(cells).toHaveLength(31);
    expect(cells[2].getAttribute('aria-label')).toBe('Ramesh Kumar, 3 Aug: Present + overtime');
    expect(cells[24].getAttribute('aria-label')).toBe('Ramesh Kumar, 25 Aug: Absent');
    expect(cells[2].getAttribute('href')).toBe('/mis/attendance?month=2026-08&emp=e1&day=2026-08-03');
  });

  it('NOT RECORDED is dashed — distinct from a recorded absence, and it is never called absent', () => {
    renderView();
    const notRecorded = screen.getByRole('link', { name: 'Ramesh Kumar, 31 Aug: Not recorded' });
    expect(notRecorded.className).toContain('border-dashed');
    const absent = screen.getByRole('link', { name: 'Ramesh Kumar, 25 Aug: Absent' });
    expect(absent.className).not.toContain('border-dashed');
    expect(absent.className).toContain('bg-red-100');
    expect(absent.textContent).toBe('A');
  });

  it('overtime is a stripe on a present day — the same cell, not a second one', () => {
    renderView();
    const ot = screen.getByRole('link', { name: 'Ramesh Kumar, 3 Aug: Present + overtime' });
    const plain = screen.getByRole('link', { name: 'Ramesh Kumar, 2 Aug: Present' });
    expect(ot.className).toContain('bg-green-100');
    expect(ot.className).toContain('border-b-4');
    expect(plain.className).not.toContain('border-b-4');
  });

  it('leave and half day have their own glyph and colour', () => {
    renderView();
    expect(screen.getByRole('link', { name: 'Suresh Patil, 21 Aug: Leave' }).textContent).toBe('L');
    expect(screen.getByRole('link', { name: 'Suresh Patil, 22 Aug: Half day' }).textContent).toBe('½');
  });

  it('draws every column header with its weekday letter and NO weekly-off state', () => {
    const { container } = renderView();
    const heads = container.querySelectorAll('thead th');
    expect(heads[1].textContent).toBe('1S'); // 1 Aug 2026 is a Saturday
    expect(container.textContent).not.toMatch(/weekly off\b(?!.*recorded)/i);
    expect(screen.getByText(/No weekly off or working-day rule is recorded/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/26 working days/);
  });

  it('the row totals are the tallies of the row\'s own cells', () => {
    renderView();
    const row = screen.getByRole('row', { name: /Ramesh Kumar/ });
    const totals = [...row.querySelectorAll('td')].slice(31).map((td) => td.textContent);
    // present 24, half hidden (none in the pool? Suresh has one, so ½ shows), absent 1, leave –, NR 6, OT 3.0
    expect(totals).toEqual(['24', '–', '1', '–', '6', '3.0']);
  });

  it('the footer is the sum of the rows, and the sentence says how the slots add up', () => {
    const { container } = renderView();
    const foot = container.querySelector('tfoot')!;
    expect(foot.textContent).toContain('2 workers · All departments');
    const totals = [...foot.querySelectorAll('td')].map((td) => td.textContent);
    expect(totals).toEqual(['44', '1', '1', '1', '15', '3.0']);
    expect(container.textContent).toContain('62 slots = 2 workers × 31 days · 44 present + 1 half day + 1 absent + 1 leave + 15 not recorded');
  });

  it('the sum in the sentence really is the number of slots', () => {
    const t = matrix.totals;
    expect(t.present + t.half + t.absent + t.leave + t.none + t.other).toBe(t.slots);
  });

  it('a broken identity is announced, not hidden', () => {
    renderView({ identityHolds: false });
    expect(screen.getByRole('alert').textContent).toMatch(/do not add up/);
    expect(screen.getByRole('alert').textContent).not.toMatch(/export/i); // no export exists on this screen
  });

  it('half-day and other columns appear only when the pool has any', () => {
    const noHalf = buildMonthMatrix([EMPLOYEES[0]], RECORDS.filter((r) => r.employeeId === 'e1'), [], '2026-08');
    const { container } = render(
      <AttendanceMonthDesktop
        view={view({ rows: [{ id: 'e1', name: 'Ramesh Kumar', code: 'BPP-014', department: 'Printing', cells: noHalf.rows[0].cells, counts: noHalf.rows[0].counts }], totals: noHalf.totals })}
      />,
    );
    expect(container.querySelector('thead')!.textContent).not.toContain('½');
    expect(container.textContent).not.toContain('Other status');
  });

  it('an empty pool says so — no empty table', () => {
    const empty = buildMonthMatrix([], [], [], '2026-08');
    renderView({ rows: [], totals: empty.totals, selected: null });
    expect(screen.getByText('No one is in this pool for this month.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('every worker name and every cell is a 44px target', () => {
    const { container } = renderView({ canPayroll: true });
    for (const a of container.querySelectorAll('a, select, button')) expect(a.getAttribute('class') ?? '').toMatch(/min-h-11/);
  });
});

describe('the side panels', () => {
  it('with no day chosen, prompts for one and shows the person\'s month', () => {
    renderView();
    expect(screen.getByText("Click a cell for that day's punches.")).toBeTruthy();
    const month = screen.getByRole('heading', { name: 'Month total' }).closest('section')!;
    expect(within(month).getByText('24 of 31')).toBeTruthy();
    expect(month.textContent).toContain('Not recorded6');
    expect(month.textContent).toContain('3.0 h');
    expect(month.textContent).not.toMatch(/₹|hourly|rate/i); // pay is not attendance
  });

  it('a chosen day shows the punches on the factory clock and the working, with nothing rounded before the subtraction', () => {
    const day = dayDetail({ status: 'PRESENT', clockIn: punch('00:34'), clockOut: punch('12:32'), otMinutes: 178, lateMinutes: 4, shift: { name: 'Shift 1', startTime: '06:00', endTime: '15:00' } }, IST);
    renderView({ selected: { ...view().selected!, dayKey: '2026-08-04', day, dayState: 'PRESENT_OT' } });
    const panel = screen.getByText('Tuesday, 4 August 2026').closest('section')!;
    expect(panel.textContent).toContain('06:04');
    expect(panel.textContent).toContain('18:02');
    expect(panel.textContent).toContain('18:02 − 06:04 = 11 h 58 min');
    expect(panel.textContent).toContain('Shift 1: 06:00 – 15:00 = 9 h');
    expect(panel.textContent).toContain('11 h 58 min − 9 h = 2 h 58 min');
    expect(panel.textContent).toContain('Overtime recorded2 h 58 min'); // what is STORED, beside what the punches imply
    expect(panel.textContent).toContain('Late by4 min');
    expect(panel.textContent).toContain('The overtime recorded matches what the punches imply.');
    expect(panel.textContent).not.toContain('12.0'); // the artboard rounds 11 h 58 min to 12.0 BEFORE subtracting
  });

  it('when recorded overtime disagrees with the punches it says so as an alert', () => {
    const day = dayDetail({ status: 'PRESENT', clockIn: punch('00:34'), clockOut: punch('12:32'), otMinutes: 238, lateMinutes: 0, shift: { name: 'Shift 1', startTime: '06:00', endTime: '15:00' } }, IST);
    renderView({ selected: { ...view().selected!, dayKey: '2026-08-04', day, dayState: 'PRESENT_OT' } });
    expect(screen.getByRole('alert').textContent).toMatch(/differs from what the punches imply/);
  });

  it('no out punch → no invented hours', () => {
    const day = dayDetail({ status: 'PRESENT', clockIn: punch('00:34'), clockOut: null, otMinutes: 0, lateMinutes: 0, shift: null }, IST);
    const { container } = renderView({ selected: { ...view().selected!, dayKey: '2026-08-04', day, dayState: 'PRESENT' } });
    expect(container.textContent).toContain('There is no out punch');
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });

  it('no shift on the day → the shift length and implied overtime are unknown, not guessed', () => {
    const day = dayDetail({ status: 'PRESENT', clockIn: punch('00:34'), clockOut: punch('12:32'), otMinutes: 60, lateMinutes: 0, shift: null }, IST);
    const { container } = renderView({ selected: { ...view().selected!, dayKey: '2026-08-04', day, dayState: 'PRESENT' } });
    expect(container.textContent).toContain('No shift is recorded on this day');
  });

  it('a day with no record says nothing was recorded and is not an absence', () => {
    renderView({ selected: { ...view().selected!, dayKey: '2026-08-31', day: null, dayState: 'NONE' } });
    expect(screen.getByText(/Nothing was recorded for this day/).textContent).toMatch(/not counted as an absence/);
  });

  it('an approved leave with no row says so', () => {
    renderView({ selected: { ...view().selected!, dayKey: '2026-08-12', day: null, dayState: 'LEAVE' } });
    expect(screen.getByText(/On approved leave/)).toBeTruthy();
  });
});

describe('when the month could not be loaded', () => {
  it('says so as an alert, with no half-drawn grid', () => {
    const { container } = render(<AttendanceMonthDesktop view={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(container.querySelector('table')).toBeNull();
    // The message says to open the day register, so it must carry the way there.
    expect(screen.getByRole('link', { name: 'Day register' }).getAttribute('href')).toBe('/mis/attendance?view=classic');
  });
});

describe('the page and the source', () => {
  const page = readFileSync(path.join(process.cwd(), 'src/app/(mis)/mis/attendance/page.tsx'), 'utf8');
  const src = readFileSync(path.join(process.cwd(), 'src/components/mis/desktop/attendance-month-desktop.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('two layouts: the phone register is hidden from 1024px up and D8 below it; nothing else', () => {
    expect(page).toContain('className="lg:hidden"');
    expect(page).toContain('className="hidden lg:block"');
    expect(page).not.toMatch(/\b(sm|md|xl|2xl):(hidden|block)\b/);
  });

  it('ANY explicit ?view (classic, or the register\'s own daily/monthly tabs) is the register at every width — its tabs never bounce back to D8', () => {
    expect(page).toMatch(/if \(sp\.view\) return phone;/);
    expect(page).not.toMatch(/sp\.view === 'classic'\) return/);
  });

  it('the register\'s own tab links are the ones that keep it: they carry a view', () => {
    const register = readFileSync(path.join(process.cwd(), 'src/components/mis/attendance/attendance-screen.tsx'), 'utf8');
    expect(register).toContain('/mis/attendance?view=daily');
    expect(register).toContain('/mis/attendance?view=monthly');
  });

  it('a failing desktop query is logged and cannot take the phone screen down with it', () => {
    expect(page).toMatch(/try \{[\s\S]*getAttendanceMonthView[\s\S]*\} catch \(error\) \{\s*console\.error/);
  });

  it('the component imports no server module and does no counting or date arithmetic of its own', () => {
    expect(src).not.toMatch(/from '@\/server/);
    expect(src).not.toMatch(/\.reduce\(|\.filter\(\(c\)|getDay\(|getMonth\(|getFullYear|toLocaleDateString|new Date\(\)/);
  });

  it('uses only the lg breakpoint — never a third layout', () => {
    expect(src).toContain('lg:grid-cols-');
    expect(src).not.toMatch(/['" ](sm|md|xl|2xl):/);
  });

  it('shows no money — attendance only', () => {
    const { container } = renderView({ canPayroll: true });
    expect(container.textContent).not.toMatch(/₹|rupee|hourly|wage|salary|gross/i);
  });
});
