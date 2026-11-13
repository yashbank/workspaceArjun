/**
 * Go-live account functions: own password / email, Admin+Owner resets.
 * Supabase and Prisma are faked; the point is the gates, the audit payloads and "no secret in an audit row".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const profiles: Row[] = [];
const roles = new Map<string, string>();
const audit = vi.fn();
const adminUpdate = vi.fn(async (..._a: unknown[]) => ({ error: null as null | { message: string } }));
const signIn = vi.fn();
const serverUpdateUser = vi.fn();
const getCurrentUser = vi.fn();
const getMisRole = vi.fn(async (id: string) => roles.get(id) ?? null);

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword: signIn } }) }));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseAdminClient: async () => ({ auth: { admin: { updateUserById: adminUpdate } } }),
  createSupabaseServerClient: async () => ({ auth: { updateUser: serverUpdateUser, getUser: async () => ({ data: { user: null } }) } }),
}));
vi.mock('@/server/auth', () => ({ getCurrentUser: () => getCurrentUser() }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: (id: string) => getMisRole(id) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (a: unknown) => audit(a) }));
vi.mock('@/server/db', () => ({
  db: {
    userProfile: {
      findUnique: async ({ where }: Row) => profiles.find((p) => p.id === where.id) ?? null,
      findFirst: async ({ where }: Row) => profiles.find((p) => p.email === where.email && (!where.id?.not || p.id !== where.id.not)) ?? null,
      update: async ({ where, data }: Row) => {
        const i = profiles.findIndex((p) => p.id === where.id);
        profiles[i] = { ...profiles[i], ...data };
        return profiles[i];
      },
    },
  },
}));

import { adminChangeEmail, adminResetPassword, changeOwnEmail, changeOwnPassword } from './account';

const STRONG = 'Str0ng!Passw0rd';

beforeEach(() => {
  profiles.length = 0;
  roles.clear();
  vi.clearAllMocks();
  profiles.push(
    { id: 'owner', authId: 'a-owner', email: 'owner@x.com' },
    { id: 'admin', authId: 'a-admin', email: 'admin@x.com' },
    { id: 'qc', authId: 'a-qc', email: 'qc@x.com' },
  );
  roles.set('owner', 'OWNER');
  roles.set('admin', 'ADMIN');
  roles.set('qc', 'QC');
  signIn.mockResolvedValue({ error: null });
  getCurrentUser.mockResolvedValue(profiles[2]);
});

const auditJson = () => JSON.stringify(audit.mock.calls);

describe('changeOwnPassword', () => {
  it('verifies the current password, sets the new one and clears the must-change flag', async () => {
    await changeOwnPassword('OldPass1!x', STRONG, STRONG);
    expect(signIn).toHaveBeenCalledWith({ email: 'qc@x.com', password: 'OldPass1!x' });
    expect(adminUpdate).toHaveBeenCalledWith('a-qc', { password: STRONG, user_metadata: { must_change_password: false } });
    expect(auditJson()).not.toContain(STRONG);
    expect(auditJson()).not.toContain('OldPass1!x');
  });
  it('refuses a wrong current password', async () => {
    signIn.mockResolvedValue({ error: { message: 'bad' } });
    await expect(changeOwnPassword('nope', STRONG, STRONG)).rejects.toThrow(/current password is wrong/i);
    expect(adminUpdate).not.toHaveBeenCalled();
  });
  it('refuses weak, mismatched or unchanged passwords', async () => {
    await expect(changeOwnPassword('Old1!aaaa', 'weak', 'weak')).rejects.toThrow(/must include/i);
    await expect(changeOwnPassword('Old1!aaaa', STRONG, STRONG + 'x')).rejects.toThrow(/do not match/i);
    await expect(changeOwnPassword(STRONG, STRONG, STRONG)).rejects.toThrow(/different/i);
    expect(adminUpdate).not.toHaveBeenCalled();
  });
  it('needs a signed-in user', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(changeOwnPassword('a', STRONG, STRONG)).rejects.toThrow(/sign in/i);
  });
});

describe('changeOwnEmail', () => {
  it('reports pending when Supabase wants a confirmation mail and leaves the profile alone', async () => {
    serverUpdateUser.mockResolvedValue({ data: { user: { email: 'qc@x.com', new_email: 'new@x.com' } }, error: null });
    const r = await changeOwnEmail(' NEW@x.com ');
    expect(r).toEqual({ status: 'pending', email: 'new@x.com' });
    expect(profiles[2].email).toBe('qc@x.com');
  });
  it('updates the profile when Supabase applied it at once', async () => {
    serverUpdateUser.mockResolvedValue({ data: { user: { email: 'new@x.com' } }, error: null });
    expect(await changeOwnEmail('new@x.com')).toEqual({ status: 'changed', email: 'new@x.com' });
    expect(profiles[2].email).toBe('new@x.com');
  });
  it('refuses a bad, same or taken email', async () => {
    await expect(changeOwnEmail('nope')).rejects.toThrow(/valid email/i);
    await expect(changeOwnEmail('qc@x.com')).rejects.toThrow(/already your email/i);
    await expect(changeOwnEmail('admin@x.com')).rejects.toThrow(/in use/i);
    expect(serverUpdateUser).not.toHaveBeenCalled();
  });
});

describe('admin resets', () => {
  it('QC cannot reset anyone', async () => {
    getCurrentUser.mockResolvedValue(profiles[2]);
    await expect(adminResetPassword('admin')).rejects.toThrow(/not permitted/i);
    await expect(adminChangeEmail('admin', 'z@x.com')).rejects.toThrow(/not permitted/i);
  });
  it('Admin resets a QC password: temp password returned once, flag set, audit has no secret', async () => {
    getCurrentUser.mockResolvedValue(profiles[1]);
    const { temporaryPassword } = await adminResetPassword('qc');
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(adminUpdate).toHaveBeenCalledWith('a-qc', { password: temporaryPassword, user_metadata: { must_change_password: true } });
    expect(auditJson()).not.toContain(temporaryPassword);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'admin', action: 'account.password.reset', entityId: 'qc' }));
  });
  it('Admin cannot reset the Owner (password or email); the Owner can', async () => {
    getCurrentUser.mockResolvedValue(profiles[1]);
    await expect(adminResetPassword('owner')).rejects.toThrow(/only the owner/i);
    await expect(adminChangeEmail('owner', 'z@x.com')).rejects.toThrow(/only the owner/i);
    expect(adminUpdate).not.toHaveBeenCalled();
    getCurrentUser.mockResolvedValue(profiles[0]);
    await expect(adminResetPassword('admin', STRONG)).resolves.toEqual({ temporaryPassword: STRONG });
  });
  it('rejects a weak chosen password', async () => {
    getCurrentUser.mockResolvedValue(profiles[0]);
    await expect(adminResetPassword('qc', 'abc')).rejects.toThrow(/must include/i);
  });
  it('admin email change updates auth + profile, audits both addresses, refuses duplicates', async () => {
    getCurrentUser.mockResolvedValue(profiles[1]);
    await adminChangeEmail('qc', 'qc.new@x.com');
    expect(adminUpdate).toHaveBeenCalledWith('a-qc', { email: 'qc.new@x.com', email_confirm: true });
    expect(profiles[2].email).toBe('qc.new@x.com');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'admin', action: 'account.email.admin_change', before: { email: 'qc@x.com' }, after: { email: 'qc.new@x.com' } }));
    await expect(adminChangeEmail('qc', 'owner@x.com')).rejects.toThrow(/in use/i);
  });
});
