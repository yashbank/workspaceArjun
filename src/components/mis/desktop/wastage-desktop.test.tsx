/**
 * Phase 24D · D7 — the wastage report.
 *
 * What a screenshot cannot enforce: one unit at a time (never Kg + Nos), only two labels on the
 * chart, a percentage that names its denominator, no allowance line or breach colour when no
 * allowance is recorded, and an export that is the same report.
 */
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWastage, type WastageLog, type WastageReport } from '@/lib/mis/wastage';

import { WastageDesktop } from './wastage-desktop';

const at = (day: string) => new Date(`${day}T06:00:00Z`);
const log = (over: Partial<WastageLog> & { day: string }): WastageLog => {
  const { day, ...rest } = over;
  return {
    loggedAt: at(day), qtyProduced: 1000, qtyWaste: 20, unit: 'KG', machineId: 'm1', machineName: 'Heidelberg SM 74',
    orderId: 'o1', orderNumber: 'ORD-114', description: 'Notebook 200pg', phaseName: 'Printing', ...rest,
  };
};
const LOGS: WastageLog[] = [
  log({ day: '2026-08-18', qtyWaste: 30, phaseName: 'Printing' }),
  log({ day: '2026-08-18', qtyWaste: 10, phaseName: 'Die cutting', machineId: 'm2', machineName: 'Auto Platen 1', orderId: 'o2', orderNumber: 'ORD-118', description: 'Duplex carton' }),
  log({ day: '2026-09-08', qtyWaste: 15, phaseName: 'Printing' }),
  log({ day: '2026-09-09', qtyWaste: 4, phaseName: 'Lamination', machineId: 'm2', machineName: 'Auto Platen 1', orderId: 'o2', orderNumber: 'ORD-118', description: 'Duplex carton' }),
];
const REPORT: WastageReport = buildWastage(LOGS, { timeZone: 'Asia/Kolkata', lastKey: '2026-09-10', weeks: 4 });
const renderReport = (r: WastageReport = REPORT) => render(<WastageDesktop report={r} />);

describe('when the report could not be loaded', () => {
  it('says so as an alert, with no half-drawn chart', () => {
    const { container } = render(<WastageDesktop report={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('the header', () => {
  it('states the period, the total, and what the percentage is a percentage of', () => {
    const { container } = renderReport();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Wastage');
    const summary = container.textContent!;
    expect(summary).toContain('17/08/2026 – 10/09/2026');
    expect(summary).toContain('4 weeks');
    expect(summary).toContain('59 Kg total');
    expect(summary).toMatch(/1\.5% of output/); // 59 ÷ 4000
  });

  it('offers the span as links, marks the current one, and keeps the machine and unit in the query', () => {
    renderReport({ ...REPORT, machineId: 'm1' });
    const nav = screen.getByRole('navigation', { name: 'Period' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['4', '10', '13', '26']);
    expect(within(nav).getByRole('link', { name: '4' }).getAttribute('aria-current')).toBe('true');
    expect(within(nav).getByRole('link', { name: '10' }).getAttribute('href')).toBe('/mis/reports?weeks=10&machine=m1&unit=KG');
  });

  it('Export CSV is a link to the server export carrying the same filters', () => {
    renderReport({ ...REPORT, machineId: 'm2' });
    expect(screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')).toBe('/api/mis/reports/wastage?weeks=4&machine=m2&unit=KG');
    expect(screen.getByRole('link', { name: 'Export orders CSV' }).getAttribute('href')).toBe('/api/mis/reports/wastage?weeks=4&machine=m2&unit=KG&part=orders');
  });

  it('the machine filter is a plain GET form whose choices are the machines seen', () => {
    const { container } = renderReport({ ...REPORT, machineId: 'm2' });
    const form = container.querySelector('form')!;
    expect(form.getAttribute('method')).toBe('get');
    expect(form.getAttribute('action')).toBe('/mis/reports');
    const select = screen.getByRole('combobox', { name: 'Machine' }) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(['All machines', 'Auto Platen 1', 'Heidelberg SM 74']);
    expect(select.value).toBe('m2');
    expect((form.querySelector('input[name="weeks"]') as HTMLInputElement).value).toBe('4');
  });
});

describe('the tabs', () => {
  it('Wastage is the current page; the others reach the existing reports; Machine utilisation is absent (not built)', () => {
    renderReport();
    const nav = screen.getByRole('navigation', { name: 'Report' });
    expect(within(nav).getByRole('link', { name: 'Wastage' }).getAttribute('aria-current')).toBe('page');
    for (const name of ['Production', 'Quality', 'Attendance']) {
      expect(within(nav).getByRole('link', { name }).getAttribute('href')).toBe('/mis/reports?view=classic');
    }
    expect(screen.queryByText(/utilisation/i)).toBeNull();
  });
});

describe('the chart — one unit, one axis, two labels', () => {
  it('draws one bar segment per week per phase, in the series hues the report chose', () => {
    const { container } = renderReport();
    const rects = [...container.querySelectorAll('svg rect')];
    const fills = new Set(rects.map((r) => r.getAttribute('fill')));
    expect(fills).toEqual(new Set(REPORT.series.map((s) => s.hue)));
    // week 1: Printing + Die cutting; week 4: Printing + Lamination.
    expect(rects).toHaveLength(4);
  });

  it('prints only the first and the last week\'s total on the chart — every other value is read off the axis', () => {
    const { container } = renderReport();
    const printed = [...container.querySelectorAll('svg text.fill-slate-900')].map((t) => t.textContent);
    expect(printed).toEqual(['40', '19']);
  });

  it('with waste in EVERY week, still only the first and last are labelled', () => {
    const every = buildWastage(
      ['2026-08-18', '2026-08-25', '2026-09-01', '2026-09-08'].map((day, i) => log({ day, qtyWaste: 10 + i })),
      { timeZone: 'Asia/Kolkata', lastKey: '2026-09-10', weeks: 4 },
    );
    const { container } = renderReport(every);
    expect([...container.querySelectorAll('svg text.fill-slate-900')].map((t) => t.textContent)).toEqual(['10', '13']);
  });

  it('a segment gap is a 2px surface stroke, not a line', () => {
    const { container } = renderReport();
    for (const rect of container.querySelectorAll('svg rect')) {
      expect(rect.getAttribute('stroke-width')).toBe('2');
      expect(rect.getAttribute('class')).toContain('stroke-white');
    }
  });

  it('carries the same numbers as a table for a screen reader', () => {
    renderReport();
    const table = screen.getByRole('table', { name: /Wastage by phase, by week/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['30', '10', '0', '40']);
  });

  it('names its unit and its series in the legend, and says no event is marked', () => {
    renderReport();
    const legend = screen.getAllByRole('list')[0];
    expect([...legend.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Printing', 'Die cutting', 'Lamination']);
    expect(screen.getByText(/not recorded, so nothing is marked on the chart/)).toBeTruthy();
    // The note above MENTIONS an ink change to say none is recorded; nothing is drawn on the chart itself.
    expect(document.querySelector('svg')!.textContent).not.toMatch(/ink change|Aug/i);
    expect(screen.queryByText(/down \d+%/i)).toBeNull(); // no invented headline
  });

  it('the neutral series is worded, not just a grey swatch', () => {
    renderReport(buildWastage([log({ day: '2026-09-08', phaseName: null })], { timeZone: 'Asia/Kolkata', lastKey: '2026-09-10', weeks: 4 }));
    expect(screen.getAllByText('Other or no phase').length).toBeGreaterThan(0);
  });

  it('an empty period says so — no empty axis pretending to be a chart', () => {
    const { container } = renderReport(buildWastage([], { timeZone: 'Asia/Kolkata', lastKey: '2026-09-10', weeks: 4 }));
    expect(screen.getByText('No wastage was recorded in these weeks.')).toBeTruthy();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).not.toMatch(/NaN|undefined/);
  });
});

describe('mixed units are never added', () => {
  const mixed = buildWastage([...LOGS, log({ day: '2026-09-08', unit: 'NOS', qtyWaste: 500, qtyProduced: 50000 })], { timeZone: 'Asia/Kolkata', lastKey: '2026-09-10', weeks: 4 });

  it('says so and offers each unit as a link, marking the one shown', () => {
    renderReport(mixed);
    expect(screen.getByText(/more than one unit/)).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Unit' });
    expect(within(group).getByRole('link', { name: 'Nos' }).getAttribute('aria-current')).toBe('true');
    expect(within(group).getByRole('link', { name: 'Kg' }).getAttribute('href')).toBe('/mis/reports?weeks=4&unit=KG');
  });

  it('a single unit shows no such control', () => {
    renderReport();
    expect(screen.queryByText(/more than one unit/)).toBeNull();
    expect(screen.queryByRole('group', { name: 'Unit' })).toBeNull();
  });
});

describe('by machine — no allowance is recorded, so none is drawn', () => {
  it('lists machines by waste with the share of THEIR output, and no breach colour or "vs allowed" column', () => {
    const { container } = renderReport();
    const card = screen.getByRole('heading', { name: 'Wastage by machine' }).closest('section')!;
    const items = within(card).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Heidelberg SM 74' + '45 Kg · 2.3%', 'Auto Platen 1' + '14 Kg · 0.7%']);
    expect(card.textContent).toContain('No wastage allowance is recorded');
    expect(container.innerHTML).not.toMatch(/bg-red|text-red|vs allowed/i);
  });

  it('bars share ONE scale: the biggest is full width and the others are proportional', () => {
    renderReport();
    const bars = screen.getAllByRole('img', { name: /: \d+ Kg/ }).map((b) => (b.firstElementChild as HTMLElement).style.width);
    expect(bars[0]).toBe('100%');
    expect(parseFloat(bars[1])).toBeCloseTo((14 / 45) * 100, 1);
  });

  it('no machine named → says so', () => {
    renderReport(buildWastage([log({ day: '2026-09-08', machineId: null, machineName: null })], { timeZone: 'Asia/Kolkata', lastKey: '2026-09-10', weeks: 4 }));
    expect(screen.getByText('No machine is named on these entries.')).toBeTruthy();
  });
});

describe('top orders', () => {
  it('links each order, gives waste and the % of ITS output, and states the total with its denominator', () => {
    const { container } = renderReport();
    const card = screen.getByRole('heading', { name: 'Top orders by wastage' }).closest('section')!;
    const link = within(card).getByRole('link', { name: 'ORD-114' });
    expect(link.getAttribute('href')).toBe('/mis/orders/o1');
    const row = link.closest('tr')!;
    expect(row.textContent).toContain('Notebook 200pg');
    expect(row.textContent).toContain('45 Kg');
    expect(row.textContent).toMatch(/2\.3%/);
    expect(container.textContent).toContain('Total, all 2 orders');
    expect(container.textContent).toMatch(/1\.5% of 4,000 Kg/);
  });

  it('an order with no output shows a dash — not 0% and not NaN — and the total says no output was recorded', () => {
    const r = buildWastage([log({ day: '2026-09-08', qtyProduced: 0, qtyWaste: 6 })], { timeZone: 'Asia/Kolkata', lastKey: '2026-09-10', weeks: 4 });
    const { container } = renderReport(r);
    const row = screen.getByRole('link', { name: 'ORD-114' }).closest('tr')!;
    expect(row.textContent).toContain('—');
    expect(container.textContent).toContain('no output recorded');
    expect(container.textContent).not.toMatch(/NaN|Infinity|0%/);
  });

  it('no orders → says so', () => {
    renderReport(buildWastage([log({ day: '2026-09-08', qtyWaste: 0 })], { timeZone: 'Asia/Kolkata', lastKey: '2026-09-10', weeks: 4 }));
    expect(screen.getByText('No order has wastage in these weeks.')).toBeTruthy();
  });
});

describe('the page and the source', () => {
  const page = readFileSync(path.join(process.cwd(), 'src/app/(mis)/mis/reports/page.tsx'), 'utf8');
  const src = readFileSync(path.join(process.cwd(), 'src/components/mis/desktop/wastage-desktop.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('two layouts: the phone reports are hidden from 1024px up and the desktop below it; nothing else', () => {
    expect(page).toContain('className="lg:hidden"');
    expect(page).toContain('className="hidden lg:block"');
    expect(page).not.toMatch(/\b(sm|md|xl|2xl):(hidden|block)\b/);
  });

  it('a failing desktop query is logged and cannot take the phone screen down with it', () => {
    expect(page).toMatch(/try \{[\s\S]*getWastageReport[\s\S]*\} catch \(error\) \{\s*console\.error/);
    expect(page).toContain('<WastageDesktop report={wastage} />');
  });

  it('?view=classic keeps the tabbed reports reachable', () => {
    expect(page).toContain("sp.view === 'classic'");
  });

  it('the component imports no server module and does no bucketing, summing or percentage of its own', () => {
    expect(src).not.toMatch(/from '@\/server/);
    expect(src).not.toMatch(/\.reduce\(|getUTC|getDay\(|getMonth\(|toLocale|new Date\(/);
    expect(src).not.toMatch(/\/ *(totals|report)\.(produced|waste)/); // no percentage computed here
  });

  it('uses only the lg breakpoint — never a third layout', () => {
    expect(src).toContain('lg:grid-cols-');
    expect(src).not.toMatch(/['" ](sm|md|xl|2xl):/);
  });

  it('every link and control is a 44px target', () => {
    const { container } = renderReport({ ...REPORT, units: [{ unit: 'KG', waste: 1 }, { unit: 'NOS', waste: 1 }] });
    for (const el of container.querySelectorAll('a, select, button')) expect(el.getAttribute('class') ?? '').toMatch(/min-h-11/);
  });

  it('shows no money — quantities only', () => {
    const { container } = renderReport();
    expect(container.textContent).not.toMatch(/₹|rupee|cost|price|wage|salary/i);
  });
});
