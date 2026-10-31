/** R2-238 / R2-249 — a login with no employee record sees why Me is empty, and is never auto-linked. */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1', email: 'w@x.in', name: 'Worker' }) }));
const getMisEmployee = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => 'WORKER', getMisEmployee: (...a: unknown[]) => getMisEmployee(...a) }));
vi.mock('@/components/mis/roles/role-badge', () => ({ RoleBadge: ({ role }: { role: string }) => <span>{role}</span> }));

const { default: MisMePage } = await import('./page');

beforeEach(() => vi.clearAllMocks());

describe('/mis/me', () => {
  it('unlinked login: the account card, a clear "not linked, ask an Admin" notice, and none of the self-service links', async () => {
    getMisEmployee.mockResolvedValue(null);
    render(await MisMePage());
    expect(screen.getByRole('status').textContent).toMatch(/not linked to an employee record.*Ask an Admin or the Owner/);
    expect(screen.queryByText('My attendance')).toBeNull();
    expect(screen.queryByText('My leave')).toBeNull();
  });

  it('linked login: the four links, no notice', async () => {
    getMisEmployee.mockResolvedValue({ id: 'e1', name: 'Asha', employeeCode: 'E-1', nameHi: null });
    render(await MisMePage());
    expect(screen.queryByRole('status')).toBeNull();
    for (const label of ['My attendance', 'My payslips', 'My leave', 'Missed punch']) expect(screen.getByText(label)).toBeTruthy();
  });
});
