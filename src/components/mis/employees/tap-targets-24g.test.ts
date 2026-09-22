/**
 * Phase 24G · Part 3 — a handful of screens shipped rows of action links
 * and filter pills well under the 44px tap-target rule (people/records/
 * settings screens): the employees phone card's View/Badge/Edit/Delete row
 * (164 elements under 44px on the walkthrough), the attendance Daily/Monthly
 * toggle and leave-status pills at ~28-32px, and the crew shift switcher at
 * 28px. Fixed by giving each its own explicit `min-h-11` + `text-base`
 * instead of relying on flex-stretch from a sibling that might not be there.
 *
 * This reads the source so none of them can quietly shrink back down.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');

describe('24G-01 — the employees action row is an even row of >=44px buttons', () => {
  const src = read('src/components/mis/employees/employee-screen.tsx');

  it('View and Badge are styled and sized the same as Edit/Delete, not bare 14px links', () => {
    expect(src).toMatch(/actionLinkClass\s*=\s*\n?\s*'[^']*min-h-11[^']*'/);
    expect(src).toMatch(/actionLinkClass\s*=\s*\n?\s*'[^']*text-base[^']*'/);
    // Both nav links use the shared class rather than a one-off text-sm link.
    const viewLink = src.match(/<Link href=\{`\/mis\/employees\/\$\{r\.id\}`\}[^>]*>/)?.[0] ?? '';
    const badgeLink = src.match(/<Link href=\{`\/mis\/print\/badge\/\$\{r\.id\}`\}[^>]*>/)?.[0] ?? '';
    expect(viewLink).toMatch(/actionLinkClass/);
    expect(badgeLink).toMatch(/actionLinkClass/);
  });
});

describe('24G — filter pills and toggles are >=44px, not the old 28-32px chips', () => {
  const cases: Array<[string, RegExp]> = [
    // Attendance Daily/Monthly toggle.
    ['src/components/mis/attendance/attendance-screen.tsx', /min-h-11 items-center rounded-lg px-3 text-base font-medium \$\{view === 'daily'/],
    // Leave-request status filter pills (All / Pending / Approved / Rejected).
    ['src/components/mis/attendance/leave-screen.tsx', /min-h-11 items-center rounded-md px-3 text-base font-medium/],
    // Crew shift switcher.
    ['src/components/mis/machines/worker-board-screen.tsx', /min-h-11 items-center rounded-full px-3 text-base font-medium/],
  ];

  it.each(cases)('%s keeps its 44px, 16px pill styling', (file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });
});

describe('24G — a few settings/print back-links are real tap targets, not 20px text', () => {
  const cases: Array<[string, string]> = [
    ['src/components/mis/settings/aql-settings-screen.tsx', '← Settings'],
    ['src/components/mis/kiosk/device-list-screen.tsx', 'Back to settings'],
    ['src/components/mis/employees/employee-profile-screen.tsx', 'Employees</Link>'],
  ];

  it.each(cases)('%s: the link right before %s is min-h-11', (file, needle) => {
    const src = read(file);
    const i = src.indexOf(needle);
    expect(i).toBeGreaterThan(-1);
    // The nearest opening <Link ...> tag before the text/closing tag carries min-h-11.
    const tagStart = src.lastIndexOf('<Link', i);
    const tag = src.slice(tagStart, i);
    expect(tag).toMatch(/min-h-11/);
  });
});
