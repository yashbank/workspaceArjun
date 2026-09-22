/**
 * Phase 24G · Part 2 — every page heading and hand-rolled data span names a text colour.
 *
 * Found in the browser (real screenshots, not a guess): `/mis/reports`, `/mis/approvals`,
 * `/mis/qc/grid` and the order detail screen all drew their `<h1>` with no Tailwind text
 * colour class, and the BOM screen's material quantity did the same. Each one rendered as
 * near-invisible pale text on the white card underneath it — the same class of bug F-26
 * already fixed for inputs/selects (see `search-inputs.test.ts`), just on plain headings
 * and spans instead. An element that relies on the inherited body colour is one theme
 * tweak away from disappearing again, so every heading in this part names its own colour.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILES = [
  'src/components/mis/orders/order-detail-screen.tsx',
  'src/components/mis/reports/reports-screen.tsx',
  'src/components/mis/approvals/approvals-screen.tsx',
  'src/components/mis/qc/qc-grid-screen.tsx',
];

describe('page <h1> headings on the Part 2 screens name a text colour', () => {
  it.each(FILES)('%s', (file) => {
    const src = readFileSync(file, 'utf8');
    const headings = [...src.matchAll(/<h1\b[^>]*>/g)].map((m) => m[0]);
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) {
      expect(h).toMatch(/text-(slate|gray)-900/);
    }
  });
});

describe('the BOM material row names a colour for its quantity', () => {
  it('the quantity span is not left to inherit the body colour', () => {
    const src = readFileSync('src/components/mis/bom/bom-screen.tsx', 'utf8');
    expect(src).toMatch(/Number\(m\.quantity\)\.toFixed\(3\)/);
    const span = src.split('Number(m.quantity).toFixed(3)')[0].split('<span').pop() ?? '';
    expect(`<span${span}`).toMatch(/text-slate-900/);
  });
});
