/** R2-242: the late-rule workers setting is picked from ALL / DAILY / MONTHLY, not typed. */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/(mis)/mis/settings/actions', () => ({ updateRuleAction: vi.fn(async () => ({ ok: true })) }));

const { RuleRow } = await import('./settings-screen');

const rule = (ruleKey: string, ruleValue: string) => ({ id: ruleKey, ruleKey, ruleValue, valueType: 'string', label: ruleKey, description: null, effectiveFrom: new Date('2026-01-01') });

describe('RuleRow', () => {
  it('R2-242: attendance.late_rule_workers edits through a picker offering exactly ALL, DAILY, MONTHLY', () => {
    render(<RuleRow rule={rule('attendance.late_rule_workers', 'ALL')} canWrite />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    // The kit Select carries its own placeholder option (empty value); the real choices are exactly the three words.
    const options = screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    expect(options).toEqual(['ALL', 'DAILY', 'MONTHLY']);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('every other rule still edits as free text', () => {
    render(<RuleRow rule={rule('factory.timezone', 'Asia/Kolkata')} canWrite />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
