/**
 * Phase 24G · Part 2 — the tap targets the lead's metrics run measured under 44px.
 *
 * Each entry below is a real measurement from `.tmp-wt/metrics.txt` (viewport screenshots at
 * 390/768/1024/1440px): `/mis/machine-board` "History →" was 16px tall; `/mis/orders` "View" was
 * 32px; `/mis/reports` month arrows were 31×40 and the tab pills 38px; `/mis/orders/[id]` "Print
 * Job Card" was 34px and the Overview/BOM pills 38px; `/mis/approvals` "View PO" was 20px. This
 * reads the source so none of the five can shrink back under 44px (`min-h-11`) without failing.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function tagAround(src: string, needle: string): string {
  const at = src.indexOf(needle);
  expect(at, `expected to find ${JSON.stringify(needle)}`).toBeGreaterThanOrEqual(0);
  const start = src.lastIndexOf('<', at);
  const end = src.indexOf('>', at) + 1;
  return src.slice(start, end);
}

describe('fixed tap targets stay at least 44px tall', () => {
  it('/mis/machine-board — the "History →" link', () => {
    const src = readFileSync('src/components/mis/machine-board/machine-board-screen.tsx', 'utf8');
    expect(tagAround(src, 'History →')).toMatch(/min-h-11/);
  });

  it('/mis/orders — the "View" link', () => {
    const src = readFileSync('src/components/mis/orders/orders-screen.tsx', 'utf8');
    expect(tagAround(src, '>View</Link>')).toMatch(/min-h-11/);
  });

  it('/mis/reports — the month prev/next buttons and the tab pills', () => {
    const src = readFileSync('src/components/mis/reports/reports-screen.tsx', 'utf8');
    expect(tagAround(src, 'onClick={prevMonth}')).toMatch(/min-h-11/);
    expect(tagAround(src, 'onClick={nextMonth}')).toMatch(/min-h-11/);
    expect(src).toMatch(/inline-flex min-h-11 items-center px-4 text-sm font-medium border-b-2/);
  });

  it('/mis/orders/[id] — "Print Job Card" and the Overview/BOM tab pills', () => {
    const src = readFileSync('src/components/mis/orders/order-detail-screen.tsx', 'utf8');
    expect(tagAround(src, 'Print Job Card')).toMatch(/min-h-11/);
    expect(src).toMatch(/inline-flex min-h-11 items-center px-4 text-sm font-medium border-b-2/);
  });

  it('/mis/approvals — the "View PO" link', () => {
    const src = readFileSync('src/components/mis/approvals/approvals-screen.tsx', 'utf8');
    expect(tagAround(src, 'View PO')).toMatch(/min-h-11/);
  });
});
