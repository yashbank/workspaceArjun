/**
 * Phase 24C · D4 — the order detail screen.
 *
 * What a screenshot cannot enforce: that the blocker is INSIDE the phase that owns it, that the
 * sign-off action is one and only one, that an empty card says so rather than showing a zero,
 * and that no rupee can appear — the component is given a type with no money in it.
 */
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { OrderDesktopData, PhaseRowView } from '@/lib/mis/order-desktop';

import { OrderDetailDesktop } from './order-detail-desktop';

const row = (over: Partial<PhaseRowView> & Pick<PhaseRowView, 'id' | 'sequence' | 'name' | 'state'>): PhaseRowView => ({
  nameHi: null, detail: '', signedAtLabel: null, startedAtLabel: null, plannedEndLabel: null, figures: null, blockers: [], ...over,
});

const BASE: OrderDesktopData = {
  orderId: 'o1',
  orderNumber: 'ORD-2026-118',
  description: 'Duplex carton · FBB 300 gsm',
  customer: 'Acme Cartons',
  status: 'IN_PROGRESS',
  receivedLabel: '28/08/2026',
  deliveryLabel: '18/09/2026',
  daysLeft: 11,
  progress: { done: 1, total: 4 },
  position: { at: 2, of: 4, name: 'Printing' },
  phases: [
    row({ id: 'p1', sequence: 1, name: 'Line clearance', state: { kind: 'SIGNED' }, signedAtLabel: '06:12', detail: 'Heidelberg SM 74' }),
    row({
      id: 'p2', sequence: 2, name: 'Printing', state: { kind: 'RUNNING' }, startedAtLabel: '06:40', plannedEndLabel: '14:00',
      detail: 'Heidelberg SM 74 · Ramesh Kumar · 4 operators',
      figures: { produced: 40850, waste: 18.5, handedOver: 40000, unit: 'Nos' },
      blockers: [{ kind: 'QC_FAILURE', parameter: 'Shade', timeLabel: '09:00' }],
    }),
    row({ id: 'p3', sequence: 3, name: 'Lamination', state: { kind: 'BLOCKED', bySequence: 2 } }),
    row({ id: 'p4', sequence: 4, name: 'Die cutting', state: { kind: 'NOT_YET' } }),
  ],
  signOff: { phaseId: 'p2', name: 'Printing', blockedReasons: 1 },
  quality: {
    strip: [
      { hour: 6, state: 'PASS' }, { hour: 7, state: 'PASS' }, { hour: 8, state: 'MISSED' }, { hour: 9, state: 'FAIL' },
      { hour: 10, state: 'UPCOMING' }, { hour: 11, state: 'UPCOMING' },
    ],
    shiftLabel: 'Shift 1', taken: 3, passed: 2, openDefect: { parameter: 'Shade', defectType: 'major' },
  },
  documents: [{ id: 'd1', name: 'Customer PO scan', meta: 'PDF · 412 KB · 28/08' }],
  bom: { statusLabel: 'APPROVED', items: [{ id: 'm1', description: 'FBB board 300 gsm', quantity: '1,240', unit: 'Kg' }] },
};

const renderScreen = (over: Partial<OrderDesktopData> = {}) => render(<OrderDetailDesktop data={{ ...BASE, ...over }} />);

describe('the header', () => {
  it('names the order, the phase position and the blocker — three chips of context before any row', () => {
    renderScreen();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('ORD-2026-118');
    expect(screen.getByText(/Phase 2 of 4 · Printing/)).toBeTruthy();
    expect(screen.getAllByText(/Shade — QC check failed/).length).toBeGreaterThan(0);
  });

  it('has exactly ONE primary action, and it is the sign-off for the running phase', () => {
    renderScreen();
    const primary = screen.getAllByRole('link').filter((a) => a.className.includes('bg-indigo-600'));
    expect(primary).toHaveLength(1);
    expect(primary[0].getAttribute('href')).toBe('/mis/production/sign-off/p2');
    expect(primary[0].textContent).toBe('Sign off printing');
  });

  it('explains what is in the way rather than staying silent — the button is tied to its reason', () => {
    renderScreen();
    const primary = screen.getAllByRole('link').find((a) => a.className.includes('bg-indigo-600'))!;
    const why = document.getElementById(primary.getAttribute('aria-describedby')!)!;
    expect(why.textContent).toMatch(/Cannot be signed yet: 1/);
  });

  it('has NO primary action when the person may not sign — absent, not disabled', () => {
    const { container } = renderScreen({ signOff: null });
    expect(screen.getAllByRole('link').filter((a) => a.className.includes('bg-indigo-600'))).toHaveLength(0);
    expect(container.querySelectorAll('[disabled],[aria-disabled="true"]')).toHaveLength(0);
  });

  it('offers the job card and a route to the full screen — capability the desktop view does not carry stays reachable', () => {
    renderScreen();
    expect(screen.getByRole('link', { name: 'Print job card' }).getAttribute('href')).toBe('/mis/print/job-card/o1');
    expect(screen.getByRole('link', { name: /Production and quality logs/ }).getAttribute('href')).toBe('/mis/orders/o1?view=classic');
  });

  it('shows delivery and days left; overdue and due-today read plainly', () => {
    renderScreen();
    expect(screen.getByText(/18\/09\/2026 · 11 days left/)).toBeTruthy();
  });

  it.each([
    [0, /due today/],
    [-2, /2 days overdue/],
  ])('days left %i reads %s', (daysLeft, pattern) => {
    renderScreen({ daysLeft });
    expect(screen.getByText(pattern)).toBeTruthy();
  });
});

describe('the process sequence — the timeline that must never collapse into a summary', () => {
  it('lists every phase in order, numbered', () => {
    renderScreen();
    const names = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(names.findIndex((t) => t.includes('Line clearance'))).toBeLessThan(names.findIndex((t) => t.includes('Printing')));
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('04')).toBeTruthy();
  });

  it('draws the three states and the split: Signed, Running, Blocked by phase 2, Not started', () => {
    renderScreen();
    expect(screen.getByText(/Signed 06:12/)).toBeTruthy();
    expect(screen.getByText(/Running · 06:40/)).toBeTruthy();
    expect(screen.getByText('Blocked by phase 2')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
  });

  it('marks the running phase as the current step, and only it', () => {
    const { container } = renderScreen();
    const current = container.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('Printing');
  });

  it('shows every figure as a PAIR — 40,850 against what the previous phase handed over — never a lone percentage', () => {
    renderScreen();
    const printing = screen.getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step')!;
    expect(printing.textContent).toContain('40,850');
    expect(printing.textContent).toContain('/ 40,000');
    expect(printing.textContent).not.toMatch(/\d\s*%/);
  });

  it('puts the blocker INSIDE the running phase, as an alert, with the reason it cannot be signed', () => {
    renderScreen();
    const printing = screen.getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step')!;
    const alert = within(printing).getByRole('alert');
    expect(alert.textContent).toContain('Shade');
    expect(alert.textContent).toContain('09:00');
    expect(alert.textContent).toContain('cannot be signed until it is cleared');
  });

  it('shows the blocker on NO other phase row', () => {
    renderScreen();
    const others = screen.getAllByRole('listitem').filter((li) => li.getAttribute('aria-current') !== 'step');
    for (const li of others) expect(within(li).queryByRole('alert')).toBeNull();
  });

  it('a running phase with nothing logged says so, not a zero', () => {
    renderScreen({
      phases: [row({ id: 'p2', sequence: 1, name: 'Printing', state: { kind: 'RUNNING' }, figures: null })],
      signOff: null,
    });
    expect(screen.getByText('Nothing recorded on this phase yet.')).toBeTruthy();
  });

  it('an order with no phase plan says "not gated" — it does not look like a loading bug (D10)', () => {
    renderScreen({ phases: [], progress: { done: 0, total: 0 }, position: null, signOff: null });
    expect(screen.getByText('No phase plan · not gated')).toBeTruthy();
  });
});

describe('quality so far', () => {
  it('draws one square per hour, each labelled with its hour and outcome', () => {
    renderScreen();
    const strip = screen.getByRole('list', { name: 'Quality so far' });
    const labels = within(strip).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'));
    expect(labels).toEqual(['06:00 Passed', '07:00 Passed', '08:00 Not taken', '09:00 Failed', '10:00 Still to come', '11:00 Still to come']);
  });

  it('a missed hour is DASHED (never recorded) and a failed one is outlined red — three visibly different states', () => {
    renderScreen();
    const items = within(screen.getByRole('list', { name: 'Quality so far' })).getAllByRole('listitem');
    expect(items[2].className).toContain('border-dashed');
    expect(items[3].className).toContain('border-red-600');
    expect(items[0].className).toContain('bg-green-100');
    expect(items[4].className).not.toContain('border-dashed');
  });

  it('says how many were taken, how many passed, and names the open defect', () => {
    renderScreen();
    expect(screen.getByText('2 of 3 taken')).toBeTruthy();
    expect(screen.getByText('Shade · major')).toBeTruthy();
  });

  it('nothing taken and nothing shown: the honest empty state, never "0 of 0 passed"', () => {
    renderScreen({ quality: { strip: [], shiftLabel: null, taken: 0, passed: 0, openDefect: null } });
    expect(screen.getByText('No QC results recorded this month.')).toBeTruthy();
    expect(screen.queryByText(/0 of 0/)).toBeNull();
  });
});

describe('the other cards', () => {
  it('order card shows only what orders record, and says what they do not', () => {
    renderScreen();
    expect(screen.getByText('Acme Cartons')).toBeTruthy();
    expect(screen.getByText('28/08/2026')).toBeTruthy();
    expect(screen.getByText(/Batch, customer PO and template are not recorded on orders yet/)).toBeTruthy();
  });

  it('a row with no value is absent, not a dash', () => {
    renderScreen({ customer: null });
    expect(screen.queryByText('Customer')).toBeNull();
  });

  it('documents list, with an empty state', () => {
    const { unmount } = renderScreen();
    expect(screen.getByText('Customer PO scan')).toBeTruthy();
    unmount();
    renderScreen({ documents: [] });
    expect(screen.getByText('No documents attached to this order.')).toBeTruthy();
  });

  it('BOM shows planned quantities, and is honest that issued quantities are not recorded', () => {
    renderScreen();
    expect(screen.getByText('1,240')).toBeTruthy();
    expect(screen.getByText(/Issued quantities are not recorded against orders yet/)).toBeTruthy();
  });

  it('a BOM longer than the preview says how many it is leaving out — the heading counts them all', () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ id: `m${i}`, description: `Material ${i}`, quantity: '1', unit: 'Kg' }));
    renderScreen({ bom: { statusLabel: 'APPROVED', items } });
    expect(screen.getByText(/9 items/)).toBeTruthy();
    expect(screen.getByText('Material 5')).toBeTruthy();
    expect(screen.queryByText('Material 6')).toBeNull();
    expect(screen.getByText(/\+3 more items/)).toBeTruthy();
  });

  it('a BOM that fits shows no "more" line', () => {
    renderScreen();
    expect(screen.queryByText(/more items/)).toBeNull();
  });

  it('no BOM says so', () => {
    renderScreen({ bom: null });
    expect(screen.getByText('No bill of materials has been created for this order.')).toBeTruthy();
  });
});

describe('NO MONEY (D4)', () => {
  it('no rupee glyph and no money word anywhere in the rendered screen', () => {
    const { container } = renderScreen();
    expect(container.textContent).not.toMatch(/₹|\bINR\b|\bRs\.?\b|\bcost\b|\bprice\b|\bwage\b|\bmargin\b/i);
  });

  it('the data type itself has no money field: a scan of the view types finds none', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/lib/mis/order-desktop.ts'), 'utf8');
    const fields = [...src.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
    expect(fields.length).toBeGreaterThan(20); // the scan found the fields
    expect(fields.filter((f) => /rate|price|cost|wage|salary|amount|rupee|inr|margin/i.test(f))).toEqual([]);
  });
});

describe('two layouts (D1/D3) — the page decides which is on screen, in CSS', () => {
  const page = readFileSync(path.join(process.cwd(), 'src/app/(mis)/mis/orders/[id]/page.tsx'), 'utf8');

  it('the phone screen is hidden from 1024px up and the desktop view is hidden below it', () => {
    expect(page).toContain('className="lg:hidden"');
    expect(page).toContain('className="hidden lg:block"');
  });

  it('uses no other breakpoint on the wrapper — never a third layout', () => {
    expect(page).not.toMatch(/\b(sm|md|xl|2xl):(hidden|block)\b/);
  });

  it('the desktop tree itself uses only the lg breakpoint — no sm/md/xl/2xl, which would be a third layout', () => {
    const src = readFileSync(path.join(process.cwd(), 'src/components/mis/desktop/order-detail-desktop.tsx'), 'utf8');
    expect(src).toContain('lg:grid-cols-[1fr_360px]'); // the two-column split is really there
    expect(src).not.toMatch(/['" ](sm|md|xl|2xl):/);
  });

  it('?view=classic keeps the full phone screen at every width', () => {
    expect(page).toContain("view === 'classic'");
  });
});
