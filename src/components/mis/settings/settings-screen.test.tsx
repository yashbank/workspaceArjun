import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/(mis)/mis/settings/actions', () => ({ updateRuleAction: async () => ({ ok: true }) }));

const { RuleRow } = await import('./settings-screen');

const rule = (ruleKey: string, ruleValue: string) => ({ id: 'r', ruleKey, ruleValue, valueType: 'string', label: 'Rule label', description: null, effectiveFrom: new Date() });

describe('RuleRow (R2-242/260)', () => {
  it('late_rule_workers edits with a 3-option select; other keys keep a text input', () => {
    const { unmount } = render(<RuleRow rule={rule('attendance.late_rule_workers', 'ALL')} canWrite />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('combobox').querySelectorAll('option')).toHaveLength(3);
    unmount();
    render(<RuleRow rule={rule('attendance.late_threshold_minutes', '10')} canWrite />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });
});
