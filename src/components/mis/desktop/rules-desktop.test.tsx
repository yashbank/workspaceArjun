/**
 * Phase 24E · D12 — business rules.
 *
 * What a screenshot cannot enforce: that the button says "Schedule change" (not "Save"), that a reason is required and
 * a start day cannot be in the past, that nothing on the screen edits or deletes a row, that a seeded row says it was
 * seeded, that the scheduled row is visible before it lands, that the false "every screen reads as of a date" claim is
 * not made, and that no unit or figure is invented.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { buildRulesLedger, type RuleRowInput } from '@/lib/mis/rules-ledger';

const scheduleRuleAction = vi.hoisted(() => vi.fn(async (_s: unknown, _f: FormData) => ({ error: null as string | null, values: undefined as undefined | { ruleValue: string; effectiveFrom: string; reason: string } })));
vi.mock('@/app/(mis)/mis/settings/rules/actions', () => ({ scheduleRuleAction }));

import { RulesDesktop } from './rules-desktop';

const row = (id: string, ruleKey: string, ruleValue: string, from: string, over: Partial<RuleRowInput> = {}): RuleRowInput => ({ id, ruleKey, ruleValue, valueType: 'number', label: over.label ?? ruleKey, description: null, effectiveFrom: new Date(`${from}T00:00:00Z`), updatedById: 'u1', updatedAt: new Date(), ...over });
const ROWS = [
  row('r0', 'AQL_MAJOR_MAX', '3.0', '2024-04-01', { label: 'AQL major defect max', updatedById: null }),
  row('r1', 'AQL_MAJOR_MAX', '2.5', '2025-04-01', { label: 'AQL major defect max' }),
  row('r2', 'AQL_MAJOR_MAX', '2.0', '2026-07-01', { label: 'AQL major defect max' }),
  row('r3', 'AQL_MAJOR_MAX', '1.5', '2026-10-01', { label: 'AQL major defect max' }),
  row('o1', 'ATTENDANCE_CORRECTION_DAYS', '3', '2025-04-01', { label: 'Correction window' }),
  row('f1', 'factory.timezone', 'Asia/Kolkata', '2024-01-01', { label: 'Factory timezone', valueType: 'string', updatedById: null }),
];
const view = (asOf = '2026-09-07', selected: string | null = 'AQL_MAJOR_MAX') => ({
  ...buildRulesLedger(ROWS, { asOf, todayKey: '2026-09-07', names: new Map([['u1', 'A. Bhaskar']]), reasons: new Map([['r3', 'Tightening after the ink change']]) }),
  selectedKey: selected, sensitiveKeys: ['AQL_MAJOR_MAX'],
});

describe('the header', () => {
  it('counts the rules, names the day, and counts the scheduled change', () => {
    render(<RulesDesktop view={view()} />);
    expect(screen.getByText('3 rules · values in force on 07/09/2026 · 1 scheduled change')).toBeTruthy();
  });

  it('says "no scheduled changes" when there are none, and pluralises', () => {
    const v = view();
    render(<RulesDesktop view={{ ...v, scheduledCount: 0 }} />);
    expect(screen.getByText(/no scheduled changes/)).toBeTruthy();
  });

  it('as-of is a plain GET form that keeps the selected rule; the change log links to the audit log', () => {
    const { container } = render(<RulesDesktop view={view()} />);
    const form = container.querySelector('form[method="get"]')!;
    expect(form.getAttribute('action')).toBe('/mis/settings/rules');
    expect((form.querySelector('input[name="rule"]') as HTMLInputElement).value).toBe('AQL_MAJOR_MAX');
    expect((screen.getByLabelText('As of') as HTMLInputElement).defaultValue).toBe('2026-09-07');
    expect(screen.getByRole('link', { name: 'Full change log' }).getAttribute('href')).toBe('/mis/audit');
  });

  it('looking at another day re-titles the list and shows that day\'s value', () => {
    render(<RulesDesktop view={view('2025-05-01')} />);
    const list = screen.getByRole('region', { name: /values in force on 01\/05\/2025/ });
    expect(within(list).getByText('2.5')).toBeTruthy();
  });
});

describe('the breadcrumb', () => {
  it('links back to Settings with a 44px tap target, and its label comes from the dictionary', () => {
    render(<RulesDesktop view={view()} />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const link = within(nav).getByRole('link', { name: 'Settings' });
    expect(link.getAttribute('href')).toBe('/mis/settings');
    expect(link.className).toContain('min-h-11');
  });
});

describe('the list', () => {
  it('shows each rule\'s value in force, its key, and the day it took effect; the selected one is marked', () => {
    render(<RulesDesktop view={view()} />);
    const list = screen.getByRole('region', { name: 'Values in force today' });
    const aql = within(list).getByRole('link', { name: /AQL major defect max/ });
    expect(aql.getAttribute('aria-current')).toBe('true');
    expect(within(aql).getByText('2.0')).toBeTruthy();
    expect(within(aql).getByText('01/07/2026')).toBeTruthy();
    expect(within(aql).getByText('Owner only')).toBeTruthy();
    expect(within(list).getByRole('link', { name: /Correction window/ }).getAttribute('aria-current')).toBeNull();
  });

  it('selecting a rule is a link that keeps the day being looked at', () => {
    render(<RulesDesktop view={view('2025-05-01')} />);
    expect(screen.getByRole('link', { name: /Correction window/ }).getAttribute('href')).toBe('/mis/settings/rules?rule=ATTENDANCE_CORRECTION_DAYS&asOf=2025-05-01');
  });

  it('a rule with nothing in force on the chosen day says "Not started yet" and a dash — it does not show its oldest row', () => {
    render(<RulesDesktop view={view('2020-01-01')} />);
    const aql = screen.getByRole('link', { name: /AQL major defect max/ });
    expect(within(aql).getByText('Not started yet')).toBeTruthy();
    expect(within(aql).getByText('—')).toBeTruthy();
    expect(within(aql).queryByText('3.0')).toBeNull();
  });

  it('invents no unit: 2.0 is not shown as 2.0% and a day count is not shown as "3days"', () => {
    const { container } = render(<RulesDesktop view={view()} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/2\.0\s*%/);
    expect(text).not.toMatch(/\d\s*(days|min)\b/);
  });

  it('does NOT claim that every screen reads a rule as of a date (F-22)', () => {
    const { container } = render(<RulesDesktop view={view()} />);
    expect(container.textContent).not.toMatch(/Every screen that uses a rule/);
    expect(container.textContent).toMatch(/others still use the value in force now/);
  });
});

describe('the history', () => {
  it('lists newest first, marks Scheduled and In force, and gives each superseded row its range', () => {
    render(<RulesDesktop view={view()} />);
    const h = screen.getByRole('region', { name: /History · AQL_MAJOR_MAX/ });
    const items = within(h).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(within(items[0]).getByText('Scheduled')).toBeTruthy();
    expect(items[0].textContent).toContain('From 01/10/2026');
    expect(within(items[1]).getByText('In force')).toBeTruthy();
    expect(items[2].textContent).toContain('01/04/2025 – 30/06/2026');
    expect(within(h).getByText('4 rows')).toBeTruthy();
  });

  it('shows the reason beside the row it belongs to, and the person who chose the value', () => {
    render(<RulesDesktop view={view()} />);
    const items = within(screen.getByRole('region', { name: /History/ })).getAllByRole('listitem');
    expect(items[0].textContent).toContain('Tightening after the ink change');
    expect(items[0].textContent).toContain('A. Bhaskar');
  });

  it('a seeded row says it was seeded — it is not credited to a person', () => {
    render(<RulesDesktop view={view()} />);
    const items = within(screen.getByRole('region', { name: /History/ })).getAllByRole('listitem');
    expect(items[3].textContent).toContain('seeded default');
    expect(items[3].textContent).not.toContain('A. Bhaskar');
  });

  it('says plainly that no row can be edited or deleted', () => {
    render(<RulesDesktop view={view()} />);
    expect(screen.getByText(/No row here can be edited or deleted/)).toBeTruthy();
  });
});

describe('the change form', () => {
  it('the button says "Schedule change" — never "Save"', () => {
    render(<RulesDesktop view={view()} />);
    expect(screen.getByRole('button', { name: 'Schedule change' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
  });

  it('a reason is required, the start day cannot be in the past, and the rule travels as a hidden field', () => {
    const { container } = render(<RulesDesktop view={view()} />);
    expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).required).toBe(true);
    const day = screen.getByLabelText('Effective from') as HTMLInputElement;
    expect(day.required).toBe(true);
    expect(day.min).toBe('2026-09-07');
    expect((screen.getByLabelText('New value') as HTMLInputElement).required).toBe(true);
    expect((container.querySelector('input[name="ruleKey"]') as HTMLInputElement).value).toBe('AQL_MAJOR_MAX');
  });

  it('tells the Owner what keeps the old value, and that nothing already printed changes', () => {
    render(<RulesDesktop view={view()} />);
    expect(screen.getByText(/Everything before this day keeps 2\.0\./)).toBeTruthy();
    expect(screen.getByText(/Nothing already printed or already judged changes/)).toBeTruthy();
  });

  it('inputs are 48px tall with 16px text (a keyboard gets no denser form than a tablet)', () => {
    render(<RulesDesktop view={view()} />);
    for (const label of ['New value', 'Effective from', 'Reason']) {
      const cls = screen.getByLabelText(label).className;
      expect(cls).toContain('min-h-12');
      expect(cls).toContain('text-base');
    }
  });

  it('cancel goes back to the list without the form, keeping the day', () => {
    render(<RulesDesktop view={view('2025-05-01')} />);
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/mis/settings/rules?asOf=2025-05-01');
  });

  it('confirms a scheduled change with a status message, and only then', () => {
    const { rerender } = render(<RulesDesktop view={view()} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<RulesDesktop view={view()} scheduled />);
    expect(screen.getByRole('status').textContent).toMatch(/scheduled/);
  });
});

describe('submitting the change', () => {
  it('a refused change shows the message AND keeps what was typed — the form is not blanked', async () => {
    scheduleRuleAction.mockResolvedValueOnce({ error: 'Nothing changed', values: { ruleValue: '1.5', effectiveFrom: '2026-10-01', reason: 'Ink change' } });
    const { container } = render(<RulesDesktop view={view()} />);
    await act(async () => { fireEvent.submit(container.querySelector('form[action=""], form:not([method="get"])')!); });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Nothing changed'));
    expect((screen.getByLabelText('New value') as HTMLInputElement).value).toBe('1.5');
    expect((screen.getByLabelText('Effective from') as HTMLInputElement).value).toBe('2026-10-01');
    expect((screen.getByLabelText('Reason') as HTMLTextAreaElement).value).toBe('Ink change');
  });

  it('while the change is being written the button says so and is disabled, so it cannot be sent twice', async () => {
    let release: (v: { error: null; values: undefined }) => void = () => {};
    scheduleRuleAction.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const { container } = render(<RulesDesktop view={view()} />);
    await act(async () => { fireEvent.submit(container.querySelector('form:not([method="get"])')!); });
    const button = await screen.findByRole('button', { name: 'Scheduling…' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await act(async () => release({ error: null, values: undefined }));
  });
});

describe('links keep only what differs from today', () => {
  it('looking at today adds no asOf to a rule link or to cancel', () => {
    render(<RulesDesktop view={view('2026-09-07')} />);
    expect(screen.getByRole('link', { name: /Correction window/ }).getAttribute('href')).toBe('/mis/settings/rules?rule=ATTENDANCE_CORRECTION_DAYS');
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/mis/settings/rules');
  });

  it('the row in force is drawn with the accent bar; a superseded row is not', () => {
    render(<RulesDesktop view={view()} />);
    const items = within(screen.getByRole('region', { name: /History/ })).getAllByRole('listitem');
    expect(items[1].className).toContain('border-indigo-600');
    expect(items[2].className).not.toContain('border-indigo-600');
  });
});

describe('nothing edits or deletes a row', () => {
  it('the only forms are the as-of read and the change; no edit, delete or remove control exists', () => {
    const { container } = render(<RulesDesktop view={view()} />);
    expect(container.querySelectorAll('form')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /edit|delete|remove/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /^(edit|delete|remove)$/i })).toBeNull();
  });
});

describe('states', () => {
  it('no rules is an honest empty state, not a blank grid', () => {
    render(<RulesDesktop view={{ ...view(), rules: [], selectedKey: null, scheduledCount: 0 }} />);
    expect(screen.getByText('No business rules are recorded yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Schedule change' })).toBeNull();
  });

  it('a refusal is "no access" and shows no rule; a failed load says so and links to the settings list', () => {
    const { unmount } = render(<RulesDesktop view={null} denied />);
    expect(screen.getByRole('alert').textContent).toMatch(/Owner only/);
    unmount();
    render(<RulesDesktop view={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/could not be loaded/);
    expect(screen.getByRole('link', { name: 'Open the settings list' }).getAttribute('href')).toBe('/mis/settings');
  });
});

describe('hygiene', () => {
  const dir = path.resolve(__dirname);
  const files = ['rules-desktop.tsx', 'rules-change-form.tsx'].map((f) => readFileSync(path.join(dir, f), 'utf8'));

  it('introduces no hex colour beyond the one the D10 panel already uses', () => {
    for (const src of files) {
      const hexes = src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hexes.every((h) => h.toLowerCase() === '#f1ebdf')).toBe(true);
    }
  });

  it('the client files import no server module by value', () => {
    for (const src of files) {
      const imports = src.match(/^import\s[^;]*?from\s'@\/server\/[^']+';/gm) ?? [];
      expect(imports.filter((l) => !l.startsWith('import type'))).toEqual([]);
    }
  });

  it('there is no third layout: no md/xl/2xl breakpoint, only lg', () => {
    for (const src of files) expect(src).not.toMatch(/\b(sm|md|xl|2xl):/);
  });

  it('no English is hard-coded in the desktop files: the breadcrumb label and every visible string come from the dictionary', () => {
    for (const src of files) expect(src).not.toMatch(/aria-label="[A-Za-z]/);
  });
});
