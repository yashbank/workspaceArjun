/**
 * Phase 24 · D3 — the sidebar's sections.
 *
 * The rule being defended is "absent, never disabled": the desktop groups what the server
 * already permitted and can neither add to it nor grey anything out.
 */
import { describe, expect, it } from 'vitest';

import { DESKTOP_NAV_SECTIONS, groupDesktopNav, sectionLabelKey } from './desktop-nav';
import { DICTIONARIES } from './i18n/dictionaries';

const entry = (id: string) => ({ id });

describe('groupDesktopNav', () => {
  it('puts each entry under the department D3 names', () => {
    const grouped = groupDesktopNav([entry('orders'), entry('quality'), entry('attendance')]);
    expect(grouped.map((g) => g.section)).toEqual(['PRODUCTION', 'QUALITY', 'PEOPLE']);
  });

  it('never invents an entry — the output holds exactly the input, regrouped', () => {
    const input = [entry('orders'), entry('quality'), entry('attendance'), entry('settings')];
    const flat = groupDesktopNav(input).flatMap((g) => g.entries);
    expect(flat).toHaveLength(input.length);
    expect(flat.map((e) => e.id).sort()).toEqual(input.map((e) => e.id).sort());
  });

  it('drops a section that has nothing in it — a role that cannot reach it sees no heading', () => {
    const grouped = groupDesktopNav([entry('orders')]);
    expect(grouped.map((g) => g.section)).toEqual(['PRODUCTION']);
    expect(grouped.map((g) => g.section)).not.toContain('QUALITY');
  });

  it('gives an empty menu no sections at all', () => {
    expect(groupDesktopNav([])).toEqual([]);
  });

  it('an id this file has no home for still appears, under the trailing section', () => {
    const grouped = groupDesktopNav([entry('a-nav-item-added-later')]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].section).toBe('OTHER');
    expect(grouped[0].entries.map((e) => e.id)).toEqual(['a-nav-item-added-later']);
  });

  it("preserves the server's order within a section", () => {
    const grouped = groupDesktopNav([entry('approvals'), entry('orders'), entry('machines')]);
    expect(grouped[0].entries.map((e) => e.id)).toEqual(['approvals', 'orders', 'machines']);
  });

  it('sections come out in D3\'s reading order', () => {
    const grouped = groupDesktopNav([entry('settings'), entry('attendance'), entry('quality'), entry('orders')]);
    expect(grouped.map((g) => g.section)).toEqual(['PRODUCTION', 'QUALITY', 'PEOPLE', 'OTHER']);
  });
});

describe('sectionLabelKey', () => {
  it('the three departments share the widget library\'s labels, in both languages', () => {
    for (const section of DESKTOP_NAV_SECTIONS.filter((s) => s !== 'OTHER')) {
      const key = sectionLabelKey(section);
      expect(key).toBe(`group.${section}`);
      for (const locale of ['en', 'hi'] as const) {
        expect(DICTIONARIES[locale][key!], `${section} ${locale}`).toBeTruthy();
      }
    }
  });

  it('the trailing section has no heading — it is a leftover, not a department', () => {
    expect(sectionLabelKey('OTHER')).toBeNull();
  });
});
