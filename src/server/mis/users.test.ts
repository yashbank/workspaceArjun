import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const mockUserProfileFindFirst = vi.fn();
const mockUserProfileFindMany = vi.fn();
const mockUserProfileFindUniqueOrThrow = vi.fn();
const mockEmployeeFindMany = vi.fn();
const mockEmployeeFindUnique = vi.fn();
const mockEmployeeCreate = vi.fn();
const mockEmployeeUpdate = vi.fn();
const mockEmployeeCount = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    userProfile: {
      findFirst: (...a: unknown[]) => mockUserProfileFindFirst(...a),
      findMany: (...a: unknown[]) => mockUserProfileFindMany(...a),
      findUniqueOrThrow: (...a: unknown[]) => mockUserProfileFindUniqueOrThrow(...a),
    },
    misEmployee: {
      findMany: (...a: unknown[]) => mockEmployeeFindMany(...a),
      findUnique: (...a: unknown[]) => mockEmployeeFindUnique(...a),
      create: (...a: unknown[]) => mockEmployeeCreate(...a),
      update: (...a: unknown[]) => mockEmployeeUpdate(...a),
      count: (...a: unknown[]) => mockEmployeeCount(...a),
    },
  },
}));

const mockGetSeatUsage = vi.fn();
vi.mock('@/server/users', () => ({ getSeatUsage: (...a: unknown[]) => mockGetSeatUsage(...a) }));

const mockInviteWorkspaceUser = vi.fn();
vi.mock('@/server/admin', () => ({ inviteUser: (...a: unknown[]) => mockInviteWorkspaceUser(...a) }));

const mockAudit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));

const { listMisUsers, getMisSeatSummary, inviteMisUser, listPendingMisGrants, grantMisRole } =
  await import('./users');

const NON_OWNER_ROLES = [
  'ADMIN',
  'SUPERVISOR',
  'QC',
  'ATTENDANCE_OPERATOR',
  'SUPER_ATTENDANCE_OPERATOR',
  'WORKER',
  'STORE_GUY',
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

describe('listMisUsers / getMisSeatSummary — viewable by anyone holding employees.read', () => {
  it('OWNER may view', async () => {
    getMisRole.mockResolvedValue('OWNER');
    mockEmployeeFindMany.mockResolvedValue([]);
    await expect(listMisUsers()).resolves.toEqual([]);
  });

  it('ADMIN may view (the ticket explicitly allows this)', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    mockEmployeeFindMany.mockResolvedValue([]);
    mockGetSeatUsage.mockResolvedValue({ max: 15, active: 3, pendingInvites: 1, used: 4, available: 11 });
    mockEmployeeCount.mockResolvedValue(2);
    await expect(listMisUsers()).resolves.toEqual([]);
    await expect(getMisSeatSummary()).resolves.toEqual({ max: 15, used: 4, available: 11, misUserCount: 2 });
  });

  it('WORKER (permission-less by design) cannot view', async () => {
    getMisRole.mockResolvedValue('WORKER');
    await expect(listMisUsers()).rejects.toThrow(/Not permitted: employees\.read/);
  });
});

describe('inviteMisUser / listPendingMisGrants / grantMisRole — Owner only', () => {
  it.each(NON_OWNER_ROLES)('inviteMisUser throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(inviteMisUser('new@example.com', 'SUPERVISOR')).rejects.toThrow(
      /Not permitted: users\.invite/,
    );
  });

  it.each(NON_OWNER_ROLES)('listPendingMisGrants throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(listPendingMisGrants()).rejects.toThrow(/Not permitted: users\.invite/);
  });

  it.each(NON_OWNER_ROLES)('grantMisRole throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(grantMisRole('profile-1', 'SUPERVISOR')).rejects.toThrow(/Not permitted: users\.invite/);
  });

  it('ADMIN specifically may view the list but not invite (the acceptance rule)', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    mockEmployeeFindMany.mockResolvedValue([]);
    await expect(listMisUsers()).resolves.toEqual([]);
    await expect(inviteMisUser('new@example.com', 'SUPERVISOR')).rejects.toThrow(
      /Not permitted: users\.invite/,
    );
  });
});

describe('inviteMisUser — an email that already has a workspace login', () => {
  beforeEach(() => getMisRole.mockResolvedValue('OWNER'));

  it('grants the role immediately and never calls the invite pipeline', async () => {
    mockUserProfileFindFirst.mockResolvedValue({ id: 'profile-1', email: 'existing@example.com', name: 'Existing' });
    mockUserProfileFindUniqueOrThrow.mockResolvedValue({ id: 'profile-1', email: 'existing@example.com', name: 'Existing' });
    mockEmployeeFindUnique.mockResolvedValue(null);
    mockEmployeeCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'emp-1',
      ...data,
    }));

    const result = await inviteMisUser('existing@example.com', 'SUPERVISOR');

    expect(result).toEqual({ kind: 'linked', employeeId: 'emp-1' });
    expect(mockInviteWorkspaceUser).not.toHaveBeenCalled();
  });

  it('updates the role in place when a MisEmployee already exists for that login', async () => {
    mockUserProfileFindFirst.mockResolvedValue({ id: 'profile-1', email: 'existing@example.com', name: 'Existing' });
    mockEmployeeFindUnique.mockResolvedValue({ id: 'emp-1', role: 'QC', deletedAt: null, isActive: true });
    mockEmployeeUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'emp-1',
      ...data,
    }));

    const result = await inviteMisUser('existing@example.com', 'SUPERVISOR');

    expect(result).toEqual({ kind: 'linked', employeeId: 'emp-1' });
    expect(mockEmployeeCreate).not.toHaveBeenCalled();
    expect(mockInviteWorkspaceUser).not.toHaveBeenCalled();
  });
});

describe('inviteMisUser — a brand-new email', () => {
  beforeEach(() => getMisRole.mockResolvedValue('OWNER'));

  it('reuses the workspace invite pipeline at base role member, never owner/admin', async () => {
    mockUserProfileFindFirst.mockResolvedValue(null);

    const result = await inviteMisUser('new@example.com', 'SUPERVISOR');

    expect(mockInviteWorkspaceUser).toHaveBeenCalledWith('new@example.com', 'member');
    expect(result).toEqual({ kind: 'invited' });
  });

  it('lets the reused pipeline throw for an existing/pending email rather than duplicating that check', async () => {
    mockUserProfileFindFirst.mockResolvedValue(null);
    mockInviteWorkspaceUser.mockRejectedValue(new Error('This user already has a pending invite'));

    await expect(inviteMisUser('dup@example.com', 'QC')).rejects.toThrow(/pending invite/);
  });
});

describe('audit', () => {
  beforeEach(() => getMisRole.mockResolvedValue('OWNER'));

  it('logs a role grant without needing to redact anything sensitive', async () => {
    mockUserProfileFindFirst.mockResolvedValue({ id: 'profile-1', email: 'e@example.com', name: null });
    mockUserProfileFindUniqueOrThrow.mockResolvedValue({ id: 'profile-1', email: 'e@example.com', name: null });
    mockEmployeeFindUnique.mockResolvedValue(null);
    mockEmployeeCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'emp-9', ...data }));

    await inviteMisUser('e@example.com', 'ADMIN');

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'mis.user.grant', entity: 'MisEmployee', entityId: 'emp-9' }),
    );
  });
});
