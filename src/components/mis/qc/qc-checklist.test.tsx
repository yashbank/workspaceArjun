/** R2-323: an archived (inactive) checklist form stays readable for its recorded checks; no new taps on it. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/(mis)/mis/qc/actions', () => ({ recordChecklistCheckAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { QcChecklist } = await import('./qc-checklist');

const archived = { id: 't1', name: 'Printing v1', processName: 'Printing', slotStart: '09:00', slotEnd: '11:00', parameters: ['Shade'], slots: ['09:00', '10:00'], isActive: false, sortOrder: 0 };
const checks = [{ parameterName: 'Shade', slotTime: '09:00', result: 'PASS', defectType: null, checkTime: new Date('2026-10-09T03:30:00Z'), templateId: 't1' }];

describe('R2-323 archived template', () => {
  it('is offered as "(archived)", shows its recorded checks, and its cells cannot be tapped', () => {
    render(<QcChecklist orderId="o1" templates={[archived]} checks={checks} canWrite />);
    expect(screen.getByRole('option', { name: 'Printing v1 (archived)' })).toBeTruthy();
    const cells = screen.getAllByRole('button').filter((b) => b.closest('td'));
    expect(cells.length).toBeGreaterThan(0);
    expect(cells.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });
  it('an active form keeps its cells tappable', () => {
    render(<QcChecklist orderId="o1" templates={[{ ...archived, isActive: true }]} checks={checks} canWrite />);
    expect(screen.getByRole('option', { name: 'Printing v1' })).toBeTruthy();
    const cells = screen.getAllByRole('button').filter((b) => b.closest('td'));
    expect(cells.some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });
});
