import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn((ops: unknown[]) => Promise.all(ops));
vi.mock('@/server/db', () => ({
  db: {
    misWageType: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
    $transaction: (ops: unknown[]) => mockTransaction(ops),
  },
}));

const mockAudit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockAudit(...a) }));

const { listWageTypes, listWageCodes, createWageType, addWageRate, setWageTypeActive, getWageAmount } =
  await import('./wage-type');

const ALL_ROLES = [
  'OWNER',
  'ADMIN',
  'SUPERVISOR',
  'QC',
  'ATTENDANCE_OPERATOR',
  'SUPER_ATTENDANCE_OPERATOR',
  'WORKER',
  'STORE_GUY',
] as const;
const NON_OWNER_ROLES = ALL_ROLES.filter((r) => r !== 'OWNER');

beforeEach(() => {
  vi.clearAllMocks();
  mockTransaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

describe('wage-type — OWNER only, always (S9)', () => {
  it.each(NON_OWNER_ROLES)('listWageTypes throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(listWageTypes()).rejects.toThrow(/Not permitted: wages\.read/);
  });

  it.each(NON_OWNER_ROLES)('listWageCodes throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(listWageCodes()).rejects.toThrow(/Not permitted: wages\.read/);
  });

  it.each(NON_OWNER_ROLES)('createWageType throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(
      createWageType({ name: 'General', unit: 'DAILY', amount: 500 }),
    ).rejects.toThrow(/Not permitted: wages\.read/);
  });

  it.each(NON_OWNER_ROLES)('addWageRate throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(addWageRate('WG-DAILY-01', 550)).rejects.toThrow(/Not permitted: wages\.read/);
  });

  it.each(NON_OWNER_ROLES)('setWageTypeActive throws MisForbiddenError for %s', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(setWageTypeActive('WG-DAILY-01', false)).rejects.toThrow(/Not permitted: wages\.read/);
  });

  it('OWNER may list wage types', async () => {
    getMisRole.mockResolvedValue('OWNER');
    mockFindMany.mockResolvedValue([]);
    await expect(listWageTypes()).resolves.toEqual([]);
  });
});

describe('createWageType — the code system', () => {
  beforeEach(() => getMisRole.mockResolvedValue('OWNER'));

  it('generates WG-DAILY-01 for the first daily type', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'w1',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    }));

    const created = await createWageType({ name: 'General', unit: 'DAILY', amount: 500 });

    expect(created.code).toBe('WG-DAILY-01');
    expect(created.amount).toBe(500);
  });

  it('never writes amount into the audit payload', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'w1',
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    }));

    await createWageType({ name: 'General', unit: 'DAILY', amount: 500 });

    expect(mockAudit).toHaveBeenCalledTimes(1);
    const [entry] = mockAudit.mock.calls[0];
    expect(JSON.stringify(entry)).not.toMatch(/amount/i);
  });
});

describe('addWageRate — never mutates a past row', () => {
  beforeEach(() => getMisRole.mockResolvedValue('OWNER'));

  it('creates a new row rather than updating the existing one', async () => {
    const existing = {
      id: 'w1',
      code: 'WG-DAILY-01',
      name: 'General',
      nameHi: null,
      amount: 500,
      unit: 'DAILY',
      effectiveFrom: new Date('2026-01-01'),
      isActive: true,
      deletedAt: null,
    };
    mockFindFirst.mockResolvedValue(existing);
    mockCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'w2',
      deletedAt: null,
      ...data,
    }));

    const updated = await addWageRate('WG-DAILY-01', 600, new Date('2026-10-01'));

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(updated.amount).toBe(600);
    expect(updated.code).toBe('WG-DAILY-01');
  });

  it('throws for an unknown code', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(addWageRate('WG-NOPE-01', 100)).rejects.toThrow(/not found/i);
  });
});

// 14F (F-01): getWageAmount used to be ungated — the tests here pinned "does not throw for a role
// that only holds attendance.read", which is the defect (payroll, gated on attendance.read, was its
// only caller). It returns a wage, so it is Owner-only like everything else in this module.
describe('getWageAmount — OWNER only (S9 / D24)', () => {
  it.each(NON_OWNER_ROLES)('throws MisForbiddenError for %s and never reads the table', async (role) => {
    getMisRole.mockResolvedValue(role);
    mockFindFirst.mockResolvedValue({ amount: 731.19 });
    await expect(getWageAmount('WG-DAILY-01')).rejects.toThrow(/Not permitted: wages\.read/);
    expect(mockFindFirst).not.toHaveBeenCalled();
  });

  it('the Owner gets null for an unknown code', async () => {
    getMisRole.mockResolvedValue('OWNER');
    mockFindFirst.mockResolvedValue(null);
    await expect(getWageAmount('WG-DAILY-01')).resolves.toBeNull();
  });

  it('returns the amount as a plain number, not a Decimal', async () => {
    getMisRole.mockResolvedValue('OWNER');
    mockFindFirst.mockResolvedValue({ amount: { toString: () => '650' } as unknown as number });
    // Number(decimalLike) exercises the same conversion path as a real Prisma.Decimal.
    const amount = await getWageAmount('WG-DAILY-01');
    expect(typeof amount).toBe('number');
  });
});
