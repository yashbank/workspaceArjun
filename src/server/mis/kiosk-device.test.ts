import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Gate-tablet enrolment, identity and the pull (Phase 12; D18, D19).
 *
 * The database is an in-memory fake that honours `select`, `where`, and the
 * unique constraints that matter — including the partial unique index on live
 * device names — so the tests can prove what a tablet is *never handed*, not
 * merely what the code intended to hand it.
 */

type Row = Record<string, unknown> & { id: string };

const state = {
  devices: [] as Row[],
  employees: [] as Row[],
  shifts: [] as Row[],
  allocations: [] as Row[],
  attendance: [] as Row[],
  reads: { employees: 0 },
  lastEmployeeSelect: undefined as Record<string, boolean> | undefined,
};

function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function matchOne(row: Row, key: string, cond: unknown): boolean {
  const val = row[key];
  if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
    const c = cond as Record<string, unknown>;
    if ('gt' in c && !(val instanceof Date && val > (c.gt as Date))) return false;
    if ('lte' in c && !(val instanceof Date && val <= (c.lte as Date))) return false;
    if ('in' in c && !(c.in as unknown[]).includes(val)) return false;
    if ('not' in c && val === c.not) return false;
    return true;
  }
  if (cond instanceof Date) return val instanceof Date && val.getTime() === cond.getTime();
  return val === cond;
}

const matches = (row: Row, where: Record<string, unknown> = {}) =>
  Object.entries(where).every(([k, v]) => matchOne(row, k, v));

function pick(row: Row, select?: Record<string, boolean>): Row {
  if (!select) return { ...row };
  const out: Record<string, unknown> = {};
  for (const [k, on] of Object.entries(select)) if (on) out[k] = row[k];
  return out as Row;
}

/** Enforce the three uniqueness rules the migration declares. */
function checkUnique(candidate: Row, ignoreId?: string) {
  for (const other of state.devices) {
    if (other.id === ignoreId) continue;
    if (candidate.pairingCode && other.pairingCode === candidate.pairingCode) throw uniqueViolation();
    if (candidate.tokenHash && other.tokenHash === candidate.tokenHash) throw uniqueViolation();
    const live = (r: Row) => r.status !== 'REVOKED' && typeof r.name === 'string';
    if (live(candidate) && live(other) && String(candidate.name).toLowerCase() === String(other.name).toLowerCase()) {
      throw uniqueViolation();
    }
  }
}

let nextId = 1;
const uuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;

const misKioskDevice = {
  findFirst: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
    const row = state.devices.find((r) => matches(r, where));
    return row ? pick(row, select) : null;
  },
  findUnique: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
    const row = state.devices.find((r) => matches(r, where));
    return row ? pick(row, select) : null;
  },
  findMany: async ({ where, select, take }: { where?: Record<string, unknown>; select?: Record<string, boolean>; take?: number }) =>
    state.devices
      .filter((r) => matches(r, where))
      .slice(0, take ?? 1000)
      .map((r) => pick(r, select)),
  count: async ({ where }: { where?: Record<string, unknown> }) => state.devices.filter((r) => matches(r, where)).length,
  create: async ({ data, select }: { data: Record<string, unknown>; select?: Record<string, boolean> }) => {
    const row = { id: uuid(), name: null, tokenHash: null, pairingCode: null, ...data } as Row;
    checkUnique(row);
    state.devices.push(row);
    return pick(row, select);
  },
  update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const row = state.devices.find((r) => r.id === where.id);
    if (!row) throw new Error('not found');
    const next = { ...row, ...data } as Row;
    checkUnique(next, row.id);
    Object.assign(row, data);
    return { ...row };
  },
  updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    const hits = state.devices.filter((r) => matches(r, where));
    for (const row of hits) {
      checkUnique({ ...row, ...data } as Row, row.id);
      Object.assign(row, data);
    }
    return { count: hits.length };
  },
  deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
    const before = state.devices.length;
    state.devices = state.devices.filter((r) => !matches(r, where));
    return { count: before - state.devices.length };
  },
};

vi.mock('@/server/db', () => ({
  db: {
    misKioskDevice,
    // The factory timezone rule (D22) is unseeded here, so the module falls back to Asia/Kolkata.
    misBusinessRule: { findFirst: async () => null, create: async () => ({}) },
    misEmployee: {
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
        state.reads.employees++;
        state.lastEmployeeSelect = select;
        return state.employees.filter((r) => matches(r, where)).map((r) => pick(r, select));
      },
    },
    misShift: {
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) =>
        state.shifts.filter((r) => matches(r, where)).map((r) => pick(r, select)),
    },
    misWorkerAllocation: {
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) =>
        state.allocations.filter((r) => matches(r, where)).map((r) => pick(r, select)),
    },
    misAttendance: {
      findMany: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) =>
        state.attendance.filter((r) => matches(r, where)).map((r) => pick(r, select)),
    },
  },
}));

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));

const kiosk = await import('./kiosk-device');
const { dateKeyToDbDate, factoryDateKey } = await import('@/lib/mis/factory-time');
/** Today as the pull sees it (D22): the factory's date, as the UTC-midnight value a @db.Date holds. */
const factoryToday = () => dateKeyToDbDate(factoryDateKey(new Date(), 'Asia/Kolkata'));
const { MisForbiddenError } = await import('./auth');

const asAdmin = () => {
  getCurrentUser.mockResolvedValue({ id: 'admin-1' });
  getMisRole.mockResolvedValue('ADMIN');
};
const as = (role: string) => {
  getCurrentUser.mockResolvedValue({ id: `${role}-1` });
  getMisRole.mockResolvedValue(role);
};

/** Pair a tablet all the way: request → Admin approves → tablet claims. */
async function pairTablet(name = 'GATE-01') {
  asAdmin();
  const req = await kiosk.requestEnrolment({ hardwareLabel: 'Samsung Tab A9 · Android 14' });
  await kiosk.approveEnrolment({ code: req.displayCode, name });
  const claim = await kiosk.claimEnrolment({ deviceId: req.deviceId, pollSecret: req.pollSecret });
  if (claim.status !== 'ACTIVE') throw new Error('expected ACTIVE');
  return { deviceId: req.deviceId, token: claim.token, header: `Bearer ${claim.token}` };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.devices = [];
  state.employees = [];
  state.shifts = [];
  state.allocations = [];
  state.attendance = [];
  state.reads.employees = 0;
  nextId = 1;
  asAdmin();
});

const secretsIn = (value: unknown) => /mk[ds]_[A-Za-z0-9_-]{43}/.test(JSON.stringify(value));

describe('enrolment — the tablet asks, an Admin grants (D18, K10)', () => {
  it('creates a PENDING request that expires in ten minutes and does nothing until approved', async () => {
    const before = Date.now();
    const req = await kiosk.requestEnrolment({ hardwareLabel: 'Samsung Tab A9 · Android 14' });

    expect(req.displayCode).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{2}$/);
    expect(req.expiresAt.getTime() - before).toBeGreaterThanOrEqual(kiosk.PAIRING_CODE_TTL_MS - 1000);
    expect(req.expiresAt.getTime() - before).toBeLessThanOrEqual(kiosk.PAIRING_CODE_TTL_MS + 1000);
    expect(state.devices[0]).toMatchObject({ status: 'PENDING', tokenHash: null, name: null });

    // Polling before approval yields nothing but "still waiting".
    const claim = await kiosk.claimEnrolment({ deviceId: req.deviceId, pollSecret: req.pollSecret });
    expect(claim.status).toBe('PENDING');
    expect(secretsIn(claim)).toBe(false);
  });

  it('stores only hashes — the poll secret and token exist nowhere in the table', async () => {
    const tablet = await pairTablet();
    const dump = JSON.stringify(state.devices);
    expect(dump).not.toContain(tablet.token);
    expect(state.devices[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(state.devices[0].pollSecretHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lets an Admin approve with the code typed loosely — lower case, spaces, dash or none', async () => {
    const req = await kiosk.requestEnrolment({});
    const loose = req.displayCode.toLowerCase().replace('-', '  ');
    await expect(kiosk.approveEnrolment({ code: loose, name: 'GATE-01' })).resolves.toMatchObject({ name: 'GATE-01' });
  });

  it('names the device, clears the code so a spent code is never live, and audits without secrets', async () => {
    const req = await kiosk.requestEnrolment({});
    await kiosk.approveEnrolment({ code: req.displayCode, name: '  GATE-01  ' });

    expect(state.devices[0]).toMatchObject({ status: 'ACTIVE', name: 'GATE-01', pairingCode: null, pairingExpiresAt: null, approvedById: 'admin-1' });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({ action: 'kiosk.approve', actorId: 'admin-1' });
    expect(secretsIn(audit.mock.calls)).toBe(false);
  });

  it('refuses an expired code — a photographed pairing code is worthless by evening', async () => {
    const req = await kiosk.requestEnrolment({});
    state.devices[0].pairingExpiresAt = new Date(Date.now() - 1000);

    await expect(kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-01' })).rejects.toMatchObject({ code: 'CODE_INVALID' });
    expect(state.devices[0].status).toBe('PENDING');
  });

  it('refuses a code that was already used, and one that never existed', async () => {
    const req = await kiosk.requestEnrolment({});
    await kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-01' });
    await expect(kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-02' })).rejects.toMatchObject({ code: 'CODE_INVALID' });
    await expect(kiosk.approveEnrolment({ code: 'ZZZZZ-99', name: 'GATE-03' })).rejects.toMatchObject({ code: 'CODE_INVALID' });
    await expect(kiosk.approveEnrolment({ code: 'not a code', name: 'GATE-03' })).rejects.toMatchObject({ code: 'CODE_INVALID' });
  });

  it('lets exactly one of two racing approvals of one code win', async () => {
    const req = await kiosk.requestEnrolment({});
    const results = await Promise.allSettled([
      kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-01' }),
      kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-02' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(state.devices.filter((d) => d.status === 'ACTIVE')).toHaveLength(1);
  });

  it('will not name two live tablets the same, but frees the name when one is retired', async () => {
    await pairTablet('GATE-01');
    const second = await kiosk.requestEnrolment({});
    await expect(kiosk.approveEnrolment({ code: second.displayCode, name: 'gate-01' })).rejects.toMatchObject({ code: 'NAME_TAKEN' });

    await kiosk.revokeDevice(state.devices[0].id, 'lost');
    await expect(kiosk.approveEnrolment({ code: second.displayCode, name: 'GATE-01' })).resolves.toBeDefined();
  });

  it('hands the token out exactly once — even to two polls that race', async () => {
    asAdmin();
    const req = await kiosk.requestEnrolment({});
    await kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-01' });

    const claims = await Promise.all([
      kiosk.claimEnrolment({ deviceId: req.deviceId, pollSecret: req.pollSecret }),
      kiosk.claimEnrolment({ deviceId: req.deviceId, pollSecret: req.pollSecret }),
    ]);
    expect(claims.filter((c) => c.status === 'ACTIVE')).toHaveLength(1);
    expect(claims.filter((c) => c.status === 'ALREADY_CLAIMED')).toHaveLength(1);

    const third = await kiosk.claimEnrolment({ deviceId: req.deviceId, pollSecret: req.pollSecret });
    expect(third.status).toBe('ALREADY_CLAIMED');
    expect(secretsIn(third)).toBe(false);
  });

  it('never stores or audits the token it issues', async () => {
    await pairTablet();
    expect(secretsIn(audit.mock.calls)).toBe(false);
  });

  it('reports EXPIRED to a tablet whose code lapsed before anyone approved it', async () => {
    const req = await kiosk.requestEnrolment({});
    state.devices[0].pairingExpiresAt = new Date(Date.now() - 1000);
    await expect(kiosk.claimEnrolment({ deviceId: req.deviceId, pollSecret: req.pollSecret })).resolves.toEqual({ status: 'EXPIRED' });
  });

  it('answers a wrong secret and an unknown device identically — no hint which was wrong', async () => {
    const req = await kiosk.requestEnrolment({});
    const wrongSecret = await kiosk.claimEnrolment({ deviceId: req.deviceId, pollSecret: `mks_${'A'.repeat(43)}` }).catch((e) => e);
    const unknownDevice = await kiosk.claimEnrolment({ deviceId: uuid(), pollSecret: req.pollSecret }).catch((e) => e);
    const garbage = await kiosk.claimEnrolment({ deviceId: 'nope', pollSecret: 'x' }).catch((e) => e);
    for (const e of [wrongSecret, unknownDevice, garbage]) {
      expect(e).toMatchObject({ code: 'UNAUTHORIZED', message: 'Not authorised.' });
    }
  });

  it('caps unauthenticated requests, and sweeps expired ones so the cap does not clog', async () => {
    for (let i = 0; i < kiosk.MAX_PENDING_ENROLMENTS; i++) await kiosk.requestEnrolment({});
    await expect(kiosk.requestEnrolment({})).rejects.toMatchObject({ code: 'TOO_MANY_PENDING' });

    for (const d of state.devices) d.pairingExpiresAt = new Date(Date.now() - 1000);
    await expect(kiosk.requestEnrolment({})).resolves.toBeDefined();
    expect(state.devices).toHaveLength(1);
  });

  it('reads no MIS data on the way in — the unauthenticated door touches nothing but its own row', async () => {
    await kiosk.requestEnrolment({ hardwareLabel: 'x'.repeat(500) });
    expect(state.reads.employees).toBe(0);
    expect((state.devices[0].hardwareLabel as string).length).toBeLessThanOrEqual(80);
  });
});

describe('who may pair, rename and retire (D18)', () => {
  it.each(['SUPERVISOR', 'QC', 'ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'STORE_GUY'])(
    'refuses %s every admin function and changes nothing',
    async (role) => {
      const req = await kiosk.requestEnrolment({});
      const snapshot = JSON.stringify(state.devices);
      as(role);

      await expect(kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-01' })).rejects.toBeInstanceOf(MisForbiddenError);
      await expect(kiosk.revokeDevice(req.deviceId)).rejects.toBeInstanceOf(MisForbiddenError);
      await expect(kiosk.renameDevice(req.deviceId, 'X')).rejects.toBeInstanceOf(MisForbiddenError);
      await expect(kiosk.listDevices()).rejects.toBeInstanceOf(MisForbiddenError);

      expect(JSON.stringify(state.devices)).toBe(snapshot);
      expect(audit).not.toHaveBeenCalled();
    },
  );

  it('refuses a signed-out caller', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(kiosk.listDevices()).rejects.toBeInstanceOf(MisForbiddenError);
  });

  it('lets the Owner do it too', async () => {
    as('OWNER');
    const req = await kiosk.requestEnrolment({});
    await expect(kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-01' })).resolves.toBeDefined();
  });

  it('renames an active tablet and audits before and after', async () => {
    const t = await pairTablet('GATE-01');
    audit.mockClear();
    await kiosk.renameDevice(t.deviceId, 'GATE-EAST');
    expect(state.devices[0].name).toBe('GATE-EAST');
    expect(audit.mock.calls[0][0]).toMatchObject({ action: 'kiosk.rename', before: { name: 'GATE-01' }, after: { name: 'GATE-EAST' } });
  });
});

describe('the device gate — authenticateDevice (D18)', () => {
  it.each([
    ['no header', null],
    ['an empty header', ''],
    ['the wrong scheme', 'Basic abc'],
    ['a bare token with no scheme', `mkd_${'A'.repeat(43)}`],
    ['a malformed token', 'Bearer not-a-token'],
    ['a token of the right shape that nobody holds', `Bearer mkd_${'A'.repeat(43)}`],
  ])('refuses %s', async (_label, header) => {
    await pairTablet();
    await expect(kiosk.authenticateDevice(header)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('refuses malformed credentials without touching the database at all', async () => {
    const findUnique = vi.spyOn(misKioskDevice, 'findUnique');
    for (const h of [null, '', 'Bearer x', 'Basic abc']) await kiosk.authenticateDevice(h).catch(() => undefined);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('accepts the real token', async () => {
    const t = await pairTablet();
    await expect(kiosk.authenticateDevice(t.header)).resolves.toMatchObject({ id: t.deviceId, name: 'GATE-01', revoked: false });
  });

  it('does not accept the poll secret as a token, or the pairing code as either', async () => {
    asAdmin();
    const req = await kiosk.requestEnrolment({});
    await kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-01' });
    await expect(kiosk.authenticateDevice(`Bearer ${req.pollSecret}`)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(kiosk.authenticateDevice(`Bearer ${req.displayCode}`)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('refuses a device that was approved but has not collected a token yet', async () => {
    const req = await kiosk.requestEnrolment({});
    await kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-01' });
    await expect(kiosk.authenticateDevice(null)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('revoking — immediate, and the punches are still real (D18)', () => {
  it('stops the token working on the very next request, and tells the tablet to wipe', async () => {
    const t = await pairTablet();
    await expect(kiosk.pullForDevice(t.header, {})).resolves.toBeDefined();

    await kiosk.revokeDevice(t.deviceId, 'left on a bus');

    await expect(kiosk.pullForDevice(t.header, {})).rejects.toMatchObject({ code: 'REVOKED' });
    await expect(kiosk.authenticateDevice(t.header)).rejects.toMatchObject({ code: 'REVOKED' });
  });

  it('refuses a revoked device before reading any employee data', async () => {
    const t = await pairTablet();
    await kiosk.revokeDevice(t.deviceId);
    state.reads.employees = 0;
    await kiosk.pullForDevice(t.header, {}).catch(() => undefined);
    expect(state.reads.employees).toBe(0);
  });

  it('still identifies a revoked device for punch intake, and flags it', async () => {
    const t = await pairTablet();
    await kiosk.revokeDevice(t.deviceId);
    await expect(kiosk.authenticateDevice(t.header, { allowRevoked: true })).resolves.toMatchObject({ id: t.deviceId, revoked: true });
  });

  it('keeps the row, records who and why, and audits it', async () => {
    const t = await pairTablet();
    audit.mockClear();
    await kiosk.revokeDevice(t.deviceId, 'lost at the gate');
    expect(state.devices[0]).toMatchObject({ status: 'REVOKED', revokedById: 'admin-1', revokedReason: 'lost at the gate' });
    expect(audit.mock.calls[0][0]).toMatchObject({ action: 'kiosk.revoke', after: { status: 'REVOKED', reason: 'lost at the gate' } });
  });

  it('is idempotent — retiring a retired tablet changes nothing and audits nothing more', async () => {
    const t = await pairTablet();
    await kiosk.revokeDevice(t.deviceId);
    audit.mockClear();
    await expect(kiosk.revokeDevice(t.deviceId)).resolves.toMatchObject({ alreadyRevoked: true });
    expect(audit).not.toHaveBeenCalled();
  });

  it('can cancel a pairing request that was never approved', async () => {
    const req = await kiosk.requestEnrolment({});
    await kiosk.revokeDevice(req.deviceId);
    expect(state.devices[0]).toMatchObject({ status: 'REVOKED', pairingCode: null });
    await expect(kiosk.approveEnrolment({ code: req.displayCode, name: 'GATE-01' })).rejects.toMatchObject({ code: 'CODE_INVALID' });
  });
});

describe('THE PULL PAYLOAD — id, name, badge code, shift, and nothing else (D19, D6)', () => {
  const wageish = /wage|salary|rate|pay|amount|ctc|earning|hourly|daily/i;

  function deepKeys(value: unknown, into: string[] = []): string[] {
    if (Array.isArray(value)) value.forEach((v) => deepKeys(v, into));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        into.push(k);
        deepKeys(v, into);
      }
    }
    return into;
  }

  beforeEach(() => {
    // Rows that carry far more than the tablet may see. If `select` or the mapper
    // ever spread a row, these would surface.
    state.employees = [
      { id: 'e1', employeeCode: 'EMP-0142', name: 'Ramesh Kumar', isActive: true, deletedAt: null, dailyWage: 900, salary: 27000, phone: '98xxxxxx', role: 'WORKER' },
      { id: 'e2', employeeCode: 'EMP-0150', name: 'Sunita Devi', isActive: true, deletedAt: null, dailyWage: 800, salary: 24000, phone: '97xxxxxx', role: 'WORKER' },
      { id: 'e3', employeeCode: 'EMP-0001', name: 'Left Company', isActive: false, deletedAt: null, dailyWage: 1, salary: 1, role: 'WORKER' },
      { id: 'e4', employeeCode: 'EMP-0002', name: 'Deleted Person', isActive: true, deletedAt: new Date(), dailyWage: 1, salary: 1, role: 'WORKER' },
    ];
    state.shifts = [
      { id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '14:00', isActive: true, isDefault: true },
      { id: 's2', name: 'Shift 2', startTime: '14:00', endTime: '22:00', isActive: true, isDefault: false },
    ];
  });

  it('carries exactly the four allowed keys per employee, and the shift only a clock', async () => {
    const today = factoryToday();
    state.allocations = [{ id: 'a1', employeeId: 'e1', shiftId: 's1', allocationDate: today, releasedAt: null, deletedAt: null }];
    const t = await pairTablet();

    const payload = await kiosk.pullForDevice(t.header, {});

    for (const e of payload.employees) expect(Object.keys(e).sort()).toEqual([...kiosk.PULL_EMPLOYEE_KEYS].sort());
    expect(payload.employees[0].shift && Object.keys(payload.employees[0].shift).sort()).toEqual([...kiosk.PULL_SHIFT_KEYS].sort());
    expect(payload.employees.find((e) => e.id === 'e1')).toEqual({
      id: 'e1',
      name: 'Ramesh Kumar',
      badgeCode: 'EMP-0142',
      shift: { id: 's1', name: 'Shift 1', startTime: '06:00', endTime: '14:00' },
    });
  });

  it('LEAK TEST: no key anywhere in the payload resembles wages, salary, rate or pay, and no value carries one', async () => {
    const t = await pairTablet();
    const payload = await kiosk.pullForDevice(t.header, {});

    const keys = deepKeys(payload);
    expect(keys.filter((k) => wageish.test(k))).toEqual([]);
    const text = JSON.stringify(payload);
    for (const secretValue of ['900', '27000', '24000', '98xxxxxx', '97xxxxxx']) expect(text).not.toContain(secretValue);
  });

  it('the allow-list itself is pinned — growing it needs a decision, and never a money word', () => {
    expect([...kiosk.PULL_EMPLOYEE_KEYS]).toEqual(['id', 'name', 'badgeCode', 'shift']);
    expect([...kiosk.PULL_SHIFT_KEYS]).toEqual(['id', 'name', 'startTime', 'endTime']);
    for (const k of [...kiosk.PULL_EMPLOYEE_KEYS, ...kiosk.PULL_SHIFT_KEYS]) expect(k).not.toMatch(wageish);
  });

  it('asks the database for exactly id, code and name — no other employee column is even loaded', async () => {
    const t = await pairTablet();
    await kiosk.pullForDevice(t.header, {});
    expect(state.lastEmployeeSelect).toEqual({ id: true, employeeCode: true, name: true });
  });

  it('the mapper cannot leak even if a wider row is handed to it', () => {
    const wide = { id: 'e1', name: 'A', employeeCode: 'C', dailyWage: 900, salary: 1, phone: '9', role: 'OWNER' };
    const out = kiosk.toPullEmployee(wide, { id: 's', name: 'S', startTime: '06:00', endTime: '14:00', isDefault: true, hourlyRate: 5 } as never);
    expect(Object.keys(out).sort()).toEqual(['badgeCode', 'id', 'name', 'shift']);
    expect(Object.keys(out.shift as object).sort()).toEqual(['endTime', 'id', 'name', 'startTime']);
    expect(JSON.stringify(out)).not.toMatch(/900|hourlyRate|dailyWage|phone|OWNER/);
  });

  it('lists the active roll only, factory-wide — inactive and deleted people never reach a tablet', async () => {
    const t = await pairTablet();
    const payload = await kiosk.pullForDevice(t.header, {});
    expect(payload.employees.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('resolves shift by today’s allocation, else today’s attendance, else null (D19)', async () => {
    const today = factoryToday();
    const yesterday = new Date(today.getTime() - 86_400_000);
    state.attendance = [
      { id: 't1', employeeId: 'e1', shiftId: 's2', date: today },
      { id: 't2', employeeId: 'e2', shiftId: 's2', date: yesterday }, // not today — ignored
    ];
    state.allocations = [{ id: 'a1', employeeId: 'e1', shiftId: 's1', allocationDate: today, releasedAt: null, deletedAt: null }];
    const t = await pairTablet();

    const byId = Object.fromEntries((await kiosk.pullForDevice(t.header, {})).employees.map((e) => [e.id, e.shift?.id ?? null]));

    expect(byId).toEqual({ e1: 's1', e2: null });
  });

  it('D22: “today” for a shift is the FACTORY’s date — at 00:30 IST on the 21st it is the 21st, whatever the server’s clock says', async () => {
    const t = await pairTablet();
    // 00:30 IST on the 21st is 19:00Z on the 20th (and 03:00 on the 21st at UTC+8). Only the factory zone says "the 21st".
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T19:00:00Z'));
    try {
      state.allocations = [
        { id: 'a-today', employeeId: 'e1', shiftId: 's2', allocationDate: new Date('2026-09-21T00:00:00Z'), releasedAt: null, deletedAt: null },
        { id: 'a-yday', employeeId: 'e2', shiftId: 's1', allocationDate: new Date('2026-09-20T00:00:00Z'), releasedAt: null, deletedAt: null },
      ];
      const byId = Object.fromEntries((await kiosk.pullForDevice(t.header, {})).employees.map((e) => [e.id, e.shift?.id ?? null]));
      expect(byId).toEqual({ e1: 's2', e2: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it('records a successful sync and pull, plus only the valid parts of the device’s own report', async () => {
    const t = await pairTablet();
    await kiosk.pullForDevice(t.header, {
      appVersion: '1.0.4',
      batteryPercent: 38,
      isCharging: false,
      queuedPunches: 14,
      ignoredExtra: 'DROP TABLE',
    });
    expect(state.devices[0]).toMatchObject({ appVersion: '1.0.4', batteryPercent: 38, isCharging: false, queuedPunches: 14 });
    expect(state.devices[0].lastSyncAt).toBeInstanceOf(Date);
    expect(state.devices[0].lastPullAt).toBeInstanceOf(Date);
    expect(state.devices[0]).not.toHaveProperty('ignoredExtra');
  });

  it('drops a nonsense self-report instead of failing the pull or storing it', async () => {
    const t = await pairTablet();
    await expect(
      kiosk.pullForDevice(t.header, { appVersion: '<script>', batteryPercent: 4000, isCharging: 'yes', queuedPunches: -3 }),
    ).resolves.toBeDefined();
    expect(state.devices[0].appVersion ?? null).toBeNull();
    expect(state.devices[0].batteryPercent ?? null).toBeNull();
    expect(state.devices[0].queuedPunches ?? null).toBeNull();
  });
});

describe('what the portal shows (D19)', () => {
  it('lists devices without any secret, hash or pending stranger', async () => {
    const t = await pairTablet('GATE-01');
    await kiosk.requestEnrolment({}); // a PENDING stranger
    const rows = await kiosk.listDevices();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: t.deviceId, name: 'GATE-01', status: 'ACTIVE', syncLevel: 'RED' });
    const keys = Object.keys(rows[0]).join(',');
    expect(keys).not.toMatch(/hash|token|secret|pairing/i);
    expect(secretsIn(rows)).toBe(false);
  });

  it('turns green after a sync and reads the worst tablet for the attendance card', async () => {
    const a = await pairTablet('GATE-01');
    await pairTablet('GATE-02');
    await kiosk.pullForDevice(a.header, {});

    as('ATTENDANCE_OPERATOR'); // attendance.read is enough — no kiosk.manage
    const summary = await kiosk.getKioskHealthSummary();

    expect(summary.devices.find((d) => d.name === 'GATE-01')?.level).toBe('GREEN');
    expect(summary.devices.find((d) => d.name === 'GATE-02')?.level).toBe('RED'); // never synced
    expect(summary.level).toBe('RED');
  });

  it('says null when nothing is enrolled, and refuses someone without attendance.read', async () => {
    as('ATTENDANCE_OPERATOR');
    expect((await kiosk.getKioskHealthSummary()).level).toBeNull();
    as('STORE_GUY');
    await expect(kiosk.getKioskHealthSummary()).rejects.toBeInstanceOf(MisForbiddenError);
  });
});
