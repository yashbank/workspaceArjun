/**
 * R3-SEC B37 (business-rule validation + Owner-only keys), B38 (document links), B40 (MIS user grants).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeDb, seedWorld, state } from './testing/wage-world';

vi.mock('@/server/db', () => ({ get db() { return dbProxy; } }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
vi.mock('@/server/users', () => ({ getSeatUsage: async () => ({ max: 15, used: 1, available: 14 }) }));
const inviteWorkspaceUser = vi.fn();
vi.mock('@/server/admin', () => ({ inviteUser: (...a: unknown[]) => inviteWorkspaceUser(...a) }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose fake rows
type Row = Record<string, any>;
const docs: Row[] = [];
const profiles: Row[] = [];
const employees: Row[] = [];
const dbProxy = {
  ...fakeDb,
  misDocument: {
    create: async ({ data }: Row) => { const r = { id: `doc-${docs.length + 1}`, createdAt: new Date(), ...data }; docs.push(r); return r; },
  },
  userProfile: {
    findFirst: async ({ where }: Row) => profiles.find((p) => p.email === where.email) ?? null,
    findUniqueOrThrow: async ({ where }: Row) => profiles.find((p) => p.id === where.id)!,
  },
  misEmployee: {
    ...fakeDb.misEmployee,
    findUnique: async ({ where }: Row) => {
      const r = employees.find((e) => (where.userProfileId ? e.userProfileId === where.userProfileId : e.employeeCode === where.employeeCode));
      return r ? { ...r } : null;
    },
    create: async ({ data }: Row) => { const r = { id: `emp-${employees.length + 1}`, isActive: true, deletedAt: null, ...data }; employees.push(r); return { ...r }; },
    update: async ({ where, data }: Row) => { const r = employees.find((e) => e.id === where.id)!; Object.assign(r, data); return { ...r }; },
    count: async ({ where }: Row) =>
      employees.filter((e) => e.role === where.role && e.isActive === where.isActive && !e.deletedAt && e.id !== where.id.not).length,
  },
};

const rules = await import('./business-rules');
const documents = await import('./documents');
const users = await import('./users');

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  docs.length = 0;
  profiles.length = 0;
  employees.length = 0;
  state.rules.push(
    { id: 'r-po', ruleKey: 'po_approval_threshold', ruleValue: '50000', valueType: 'number', label: 'PO', description: null, effectiveFrom: new Date('2026-01-01'), updatedById: null },
    { id: 'r-cw', ruleKey: 'ATTENDANCE_CORRECTION_DAYS', ruleValue: '3', valueType: 'number', label: 'Window', description: null, effectiveFrom: new Date('2026-01-01'), updatedById: null },
    { id: 'r-x', ruleKey: 'SOME_OTHER', ruleValue: '1', valueType: 'number', label: 'Other', description: null, effectiveFrom: new Date('2026-01-01'), updatedById: null },
  );
  getCurrentUser.mockResolvedValue({ id: 'u1', authId: 'auth-1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('B37 updateBusinessRule', () => {
  it('ADMIN on the PO threshold or the correction window is forbidden', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    await expect(rules.updateBusinessRule('po_approval_threshold', '1000')).rejects.toThrow(/Not permitted: wages\.read/);
    await expect(rules.updateBusinessRule('ATTENDANCE_CORRECTION_DAYS', '5')).rejects.toThrow(/Not permitted: wages\.read/);
  });

  it('ADMIN may still edit an ordinary rule', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    await expect(rules.updateBusinessRule('SOME_OTHER', '2')).resolves.toBeDefined();
  });

  it.each(['abc', '', 'NaN', 'Infinity'])('OWNER writing %j to a number rule is refused', async (v) => {
    await expect(rules.updateBusinessRule('po_approval_threshold', v)).rejects.toThrow(/number/i);
  });

  it('range checks: threshold 0..10,000,000, correction days an integer 0..60', async () => {
    await expect(rules.updateBusinessRule('po_approval_threshold', '-1')).rejects.toThrow(/between/);
    await expect(rules.updateBusinessRule('po_approval_threshold', '10000001')).rejects.toThrow(/between/);
    await expect(rules.updateBusinessRule('ATTENDANCE_CORRECTION_DAYS', '2.5')).rejects.toThrow(/whole number/);
    await expect(rules.updateBusinessRule('ATTENDANCE_CORRECTION_DAYS', '61')).rejects.toThrow(/between/);
    await expect(rules.updateBusinessRule('ATTENDANCE_CORRECTION_DAYS', '60')).resolves.toBeDefined();
  });

  it('OWNER 5000 is accepted', async () => {
    await expect(rules.updateBusinessRule('po_approval_threshold', '5000')).resolves.toMatchObject({ ruleValue: '5000' });
  });

  it('a second same-day revision gets the friendly message, not the constraint name', async () => {
    await rules.updateBusinessRule('po_approval_threshold', '6000');
    await expect(rules.updateBusinessRule('po_approval_threshold', '7000')).rejects.toThrow(
      'A change for this rule is already scheduled for today; edit that one.',
    );
  });
});

describe('B38 addDocument is the single choke point for links', () => {
  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example/x', 'C:\\x.pdf'])(
    'refuses %j',
    async (filePath) => {
      await expect(documents.addDocument('o1', { name: 'n', filePath })).rejects.toThrow(/link must be/);
      expect(docs).toEqual([]);
    },
  );

  it('accepts a site path and an https link (safeHref decides: http(s) absolute or /path)', async () => {
    await expect(documents.addDocument('o1', { name: 'n', filePath: '/files/a.pdf' })).resolves.toBeDefined();
    await expect(documents.addDocument('o1', { name: 'n', filePath: 'https://example.com/a.pdf' })).resolves.toBeDefined();
  });
});

describe('B40 MIS user grants', () => {
  beforeEach(() => {
    profiles.push(
      { id: 'p1', email: 'a@x.com', name: 'A', status: 'active' },
      { id: 'p2', email: 'b@x.com', name: 'B', status: 'suspended' },
    );
  });

  it('an unknown role is refused on grant, invite and link', async () => {
    await expect(users.grantMisRole('p1', 'GOD' as never)).rejects.toThrow('Unknown role');
    await expect(users.inviteMisUser('a@x.com', 'GOD' as never)).rejects.toThrow('Unknown role');
    expect(employees).toEqual([]);
  });

  it('a suspended profile cannot be granted a role', async () => {
    await expect(users.grantMisRole('p2', 'QC')).rejects.toThrow('Reactivate the user first');
    await expect(users.inviteMisUser('b@x.com', 'QC')).rejects.toThrow('Reactivate the user first');
  });

  it('demoting the last active Owner is refused; with a second Owner it is allowed', async () => {
    employees.push({ id: 'eo', userProfileId: 'p1', role: 'OWNER', isActive: true, deletedAt: null });
    await expect(users.grantMisRole('p1', 'ADMIN')).rejects.toThrow(/at least one active Owner/);
    employees.push({ id: 'eo2', userProfileId: 'other', role: 'OWNER', isActive: true, deletedAt: null });
    await expect(users.grantMisRole('p1', 'ADMIN')).resolves.toBeUndefined();
    expect(employees[0].role).toBe('ADMIN');
  });

  it('a valid grant on an active profile still works', async () => {
    await expect(users.grantMisRole('p1', 'QC')).resolves.toBeUndefined();
    expect(employees[0]).toMatchObject({ userProfileId: 'p1', role: 'QC' });
  });
});
