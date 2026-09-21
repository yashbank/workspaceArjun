/**
 * Phase 24C · D6 — the BOM tree with its costing overlay.
 *
 * What a screenshot cannot enforce: that the cost column EXISTS ONLY WHEN the data carries it (so
 * a non-Owner's screen has no column, no toggle and no overlay panel — nothing hidden, nothing
 * disabled), that a line with no rate says "not priced" and never ₹0, that a total with an
 * unpriced line is labelled a floor, and that the component does no arithmetic of its own.
 */
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import type { BomDesktopData } from '@/lib/mis/bom-desktop';

import { BomDesktop } from './bom-desktop';

/** What an Owner is handed: cost column on, one line unpriced. */
const OWNER: BomDesktopData = {
  orderId: 'o1',
  orderNumber: 'ORD-2026-118',
  description: 'Duplex carton',
  bomStatus: 'APPROVED',
  approvedLabel: '05/09',
  itemCount: 4,
  stages: [
    { id: 's1', name: 'Printed sheet', subtotal: '₹2,39,258', unpriced: 0, materials: [
      { id: 'm1', description: 'FBB board 300 gsm', quantity: '1,240', unit: 'Kg', cost: '₹1,97,594' },
      { id: 'm2', description: 'Process ink · CMYK', quantity: '24.8', unit: 'Kg', cost: '₹41,664' },
    ] },
    { id: 's3', name: 'Outer', subtotal: null, unpriced: 1, materials: [
      { id: 'm4', description: 'Outer carton · 100s', quantity: '400', unit: 'Nos', cost: null },
    ] },
  ],
  canCost: true,
  canEdit: true,
  costing: { total: '₹2,39,258', priced: 2, unpriced: 1, isFloor: true },
};

/** What everyone else is handed: the SAME tree, and no money key anywhere. */
const PLAIN: BomDesktopData = {
  ...OWNER,
  stages: OWNER.stages.map((s) => ({
    id: s.id,
    name: s.name,
    materials: s.materials.map(({ id, description, quantity, unit }) => ({ id, description, quantity, unit })),
  })),
  canCost: false,
  canEdit: false,
  costing: undefined,
};
delete (PLAIN as Partial<BomDesktopData>).costing;

const renderScreen = (data: BomDesktopData) => render(<BomDesktop data={data} />);

describe('the Owner, costing on — one tree with an extra column', () => {
  it('has a cost column, and the rolled-up total as the server formatted it', () => {
    renderScreen(OWNER);
    expect(screen.getByRole('columnheader', { name: /Cost/ })).toBeTruthy();
    expect(screen.getByText('₹1,97,594')).toBeTruthy();
    expect(screen.getByText('₹2,39,258', { selector: 'p span' })).toBeTruthy(); // the footer total
  });

  it('a line with no rate says "not priced" — never ₹0 — and so does an all-unpriced stage', () => {
    renderScreen(OWNER);
    const carton = screen.getByText('Outer carton · 100s').closest('tr')!;
    expect(within(carton).getByText('not priced')).toBeTruthy();
    expect(carton.textContent).not.toContain('₹0');
    const outer = screen.getByText('Outer').closest('tr')!;
    expect(within(outer).getByText('not priced')).toBeTruthy();
    expect(outer.textContent).not.toContain('₹');
  });

  it('a total with an unpriced line is labelled a floor, in words, as a status message', () => {
    renderScreen(OWNER);
    expect(screen.getByText('floor')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/One item is unpriced, so this total is a floor/);
  });

  it('with several unpriced it says how many', () => {
    renderScreen({ ...OWNER, costing: { ...OWNER.costing!, unpriced: 3 } });
    expect(screen.getByRole('status').textContent).toMatch(/^Some items are unpriced.*\(3\)$/);
  });

  it('a fully priced BOM has no floor label and no warning', () => {
    renderScreen({ ...OWNER, costing: { total: '₹1,000', priced: 3, unpriced: 0, isFloor: false } });
    expect(screen.queryByText('floor')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('a stage with some lines priced shows its subtotal and how many are not', () => {
    const data: BomDesktopData = {
      ...OWNER,
      stages: [{ id: 's9', name: 'Mixed', subtotal: '₹500', unpriced: 2, materials: [
        { id: 'a', description: 'Priced', quantity: '1', unit: 'Kg', cost: '₹500' },
        { id: 'b', description: 'Unknown A', quantity: '1', unit: 'Kg', cost: null },
        { id: 'c', description: 'Unknown B', quantity: '1', unit: 'Kg', cost: null },
      ] }],
    };
    renderScreen(data);
    expect(screen.getByText('Mixed').closest('tr')!.textContent).toContain('₹500');
    expect(screen.getByText('Mixed').closest('tr')!.textContent).toContain('+2 unpriced');
  });

  it('shows the Costing toggle as a LINK that reloads without the column — not a button that hides it', () => {
    renderScreen(OWNER);
    const toggle = screen.getByRole('link', { name: 'Costing · on' });
    expect(toggle.getAttribute('href')).toBe('/mis/bom/o1?costing=off');
  });

  it('shows the overlay panel with the priced and unpriced counts', () => {
    renderScreen(OWNER);
    const panel = screen.getByRole('heading', { name: 'Costing overlay' }).closest('section')!;
    expect(panel.textContent).toContain('Owner only');
    expect(within(panel).getByText('Priced').nextElementSibling!.textContent).toBe('2');
    expect(within(panel).getByText('Unpriced').nextElementSibling!.textContent).toBe('1');
  });
});

describe('the Owner, costing off — the column is DROPPED, not hidden', () => {
  const off: BomDesktopData = { ...PLAIN, canCost: true, canEdit: true };

  it('has no cost column, no total, no floor message — but can turn costing back on', () => {
    renderScreen(off);
    expect(screen.queryByRole('columnheader', { name: /Cost/ })).toBeNull();
    expect(screen.queryByText(/Material cost/i)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('link', { name: 'Costing · off' }).getAttribute('href')).toBe('/mis/bom/o1');
  });

  it('keeps the same rows, in the same order', () => {
    const { container: a } = renderScreen(OWNER);
    const { container: b } = renderScreen(off);
    const names = (c: HTMLElement) => [...c.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('th, td')!.textContent);
    expect(names(b)).toEqual(names(a));
  });
});

describe('everyone else — nothing to un-hide', () => {
  it('has no cost column, no Costing toggle, no overlay panel, and not a single rupee sign', () => {
    const { container } = renderScreen(PLAIN);
    expect(screen.queryByRole('columnheader', { name: /Cost/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Costing/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Costing overlay' })).toBeNull();
    expect(container.textContent).not.toContain('₹');
    expect(container.textContent).not.toMatch(/unpriced|floor|not priced/i);
  });

  it('still shows the whole tree', () => {
    renderScreen(PLAIN);
    expect(screen.getByText('Printed sheet')).toBeTruthy();
    expect(screen.getByText('FBB board 300 gsm')).toBeTruthy();
    expect(screen.getByText('Outer carton · 100s')).toBeTruthy();
  });

  it('the table has a name, and every stage row is a row header', () => {
    renderScreen(OWNER);
    expect(screen.getByRole('table', { name: 'Structure' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Printed sheet' })).toBeTruthy();
  });

  it('every link is a 44px target', () => {
    renderScreen(OWNER);
    for (const link of screen.getAllByRole('link')) expect(link.className).toMatch(/min-h-11/);
  });

  it('adds no colour of its own: every hex in the file is one D4 or D5 already uses', () => {
    const own = readFileSync(path.join(process.cwd(), 'src/components/mis/desktop/bom-desktop.tsx'), 'utf8').match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    const known = new Set(
      ['order-detail-desktop.tsx', 'machine-timeline-desktop.tsx', 'desktop-shell.tsx'].flatMap((f) =>
        (readFileSync(path.join(process.cwd(), 'src/components/mis/desktop', f), 'utf8').match(/#[0-9a-fA-F]{6}\b/g) ?? []).map((h) => h.toLowerCase()),
      ),
    );
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((h) => !known.has(h.toLowerCase()))).toEqual([]);
  });

  it('offers "Edit structure" only to a role that may edit', () => {
    renderScreen(PLAIN);
    expect(screen.queryByRole('link', { name: 'Edit structure' })).toBeNull();
  });
});

describe('the rest of the screen', () => {
  it('the primary action is Edit structure, and it leaves the reading view for the editable one', () => {
    renderScreen(OWNER);
    expect(screen.getByRole('link', { name: 'Edit structure' }).getAttribute('href')).toBe('/mis/bom/o1?view=edit');
  });

  it('names the BOM by its order, with the item count — and does not invent a quantity', () => {
    const { container } = renderScreen(OWNER);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Duplex carton');
    expect(container.textContent).toContain('ORD-2026-118 · 4 items · 2 stages');
    expect(container.textContent).not.toMatch(/40,000|per unit\b(?!.*not recorded)/i);
  });

  it('says versions are not recorded rather than drawing a version list', () => {
    renderScreen(OWNER);
    expect(screen.getByText(/Earlier versions are not kept yet/)).toBeTruthy();
    expect(screen.queryByText(/^v[0-9]/)).toBeNull();
    expect(screen.getByText('05/09')).toBeTruthy();
  });

  it('an unapproved BOM says so', () => {
    renderScreen({ ...OWNER, bomStatus: 'PENDING_APPROVAL', approvedLabel: null });
    expect(screen.getByText('Pending approval')).toBeTruthy();
    expect(screen.getByText('Not approved yet')).toBeTruthy();
  });

  it('an empty stage and an empty BOM each say so', () => {
    renderScreen({ ...PLAIN, stages: [{ id: 's', name: 'Empty stage', materials: [] }] });
    expect(screen.getByText('No items in this stage yet.')).toBeTruthy();
  });

  it('a BOM with no stages shows an empty state, not an empty table', () => {
    renderScreen({ ...PLAIN, stages: [], itemCount: 0 });
    expect(screen.getByText('This BOM has no stages yet.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('the source (D24 · D3)', () => {
  // Code only: the doc comments explain the rules in the very words the scans look for.
  const src = readFileSync(path.join(process.cwd(), 'src/components/mis/desktop/bom-desktop.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  const page = readFileSync(path.join(process.cwd(), 'src/app/(mis)/mis/bom/[orderId]/page.tsx'), 'utf8');

  it('does no money arithmetic and imports no costing or server module — the figures are formatted strings', () => {
    expect(src).not.toMatch(/from '@\/(server|lib\/mis\/bom-costing)/);
    expect(src).not.toMatch(/parseFloat|Number\(|Intl\.NumberFormat|toFixed|toLocaleString|reduce\(/);
  });

  it('gets the cost column from the data, not from a role check of its own', () => {
    expect(src).not.toMatch(/isOwner|wages\.read|can\(/);
  });

  it('uses only the lg breakpoint — never a third layout', () => {
    expect(src).toContain('lg:grid-cols-[1fr_360px]');
    expect(src).not.toMatch(/['" ](sm|md|xl|2xl):/);
  });

  it('the page hides the phone screen from 1024px up and the desktop below it, and nothing else', () => {
    expect(page).toContain('className="lg:hidden"');
    expect(page).toContain('className="hidden lg:block"');
    expect(page).not.toMatch(/\b(sm|md|xl|2xl):(hidden|block)\b/);
  });

  it('the page reads the data through getBomDesktopView and asks for costing unless ?costing=off', () => {
    expect(page).toContain('getBomDesktopView');
    expect(page).toContain("costing !== 'off'");
    expect(page).toContain("view === 'edit'");
  });

  it('the view type has the cost keys optional, so their absence is representable', () => {
    const types = readFileSync(path.join(process.cwd(), 'src/lib/mis/bom-desktop.ts'), 'utf8');
    for (const key of ['cost', 'subtotal', 'unpriced', 'costing']) expect(types).toMatch(new RegExp(`^\\s+${key}\\?:`, 'm'));
  });
});
