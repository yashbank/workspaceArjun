/**
 * R2-222 - missed-punch regularization: own-record-only submit/withdraw, reviewer-only approve/reject.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const audit = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => audit(...a) }));
const notifyRoles = vi.fn();
vi.mock('@/server/mis/notifications', () => ({ notifyRoles: (...a: unknown[]) => notifyRoles(...a) }));
vi.mock('@/server/mis/business-rules', () => ({
  getFactoryTimezone: async () => 'Asia/Kolkata',
  getLunchBreakMinutes: async () => 0,
  getCorrectionWindowDays: async () => 3650,
}));
vi.mock('@/server/mis/attendance', () => ({
  factoryTimeToInstant: (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00Z`),
}));

const REQ_ID = '11111111-1111-4111-8111-111111111111';
const ME = 'e-me';
let employeeOfUser: string | null = ME;
let request: Record<string, unknown> | null;
const upsert = vi.fn(async () => ({ id: 'att-1' }));
const create = vi.fn(async (a: { data: Record<string, unknown> }) => ({
  id: REQ_ID, createdAt: new Date(), decisionNote: null, status: 'PENDING', ...a.data,
}));
const updateMany = vi.fn(async () => ({ count: 1 }));
const notificationCreate = vi.fn();
let duplicate: unknown = null;

vi.mock('@/server/db', () => {
  const tx = {
    misPunchRegularization: { updateMany: (...a: unknown[]) => updateMany(...(a as [])), update: async () => ({}) },
    misAttendance: { findUnique: async () => null, upsert: (...a: unknown[]) => upsert(...(a as [])) },
    misShift: { findFirst: async () => null, findUnique: async () => null },
  };
  return {
    db: {
      misEmployee: {
        findFirst: async (a: { where: { userProfileId?: string; id?: string } }) =>
          a.where.userProfileId
            ? (employeeOfUser ? { id: employeeOfUser } : null)
            : { id: a.where.id, name: 'Asha', employeeCode: 'E1', isActive: true, deletedAt: null, userProfileId: 'u-worker' },
      },
      misPayrollPeriod: { findUnique: async () => null },
      misPunchRegularization: {
        findFirst: async () => duplicate,
        findUnique: async () => request,
        create: (...a: unknown[]) => create(...(a as [{ data: Record<string, unknown> }])),
        updateMany: (...a: unknown[]) => updateMany(...(a as [])),
      },
      notification: { create: (...a: unknown[]) => notificationCreate(...a) },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    },
  };
});

const { submitPunchRegularization, withdrawPunchRegularization, decidePunchRegularization, listPunchRegularizations } = await import('./punch-regularization');

const pending = () => ({
  id: REQ_ID, employeeId: 'e-other', workDate: new Date('2026-10-20T00:00:00Z'), status: 'PENDING',
  requestedIn: new Date('2026-10-20T09:00:00Z'), requestedOut: new Date('2026-10-20T18:00:00Z'),
});

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('WORKER');
  employeeOfUser = ME;
  duplicate = null;
  request = pending();
});

describe('submit - own record only', () => {
  const input = { employeeId: ME, workDate: '2026-10-20', requestedIn: '09:00', requestedOut: '18:00', reason: 'Forgot to punch' };

  it('a worker may submit for their own record and supervisors are told', async () => {
    await expect(submitPunchRegularization(input)).resolves.toMatchObject({ employeeId: ME, status: 'PENDING' });
    expect(create).toHaveBeenCalled();
    expect(notifyRoles).toHaveBeenCalledWith(['SUPERVISOR', 'ADMIN'], 'mis.punch_regularization.raised', expect.not.objectContaining({ wage: expect.anything() }), 'u1');
    expect(JSON.stringify(audit.mock.calls)).not.toMatch(/wage|salary/i);
  });
  it('a worker may not submit for someone else', async () => {
    await expect(submitPunchRegularization({ ...input, employeeId: 'e-other' })).rejects.toThrow(/Not permitted/);
    expect(create).not.toHaveBeenCalled();
  });
  it('refuses a signed-out caller, a future date and a second pending request', async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(submitPunchRegularization(input)).rejects.toThrow(/Not permitted/);
    getCurrentUser.mockResolvedValue({ id: 'u1' });
    await expect(submitPunchRegularization({ ...input, workDate: '2999-01-01' })).rejects.toThrow(/future/);
    duplicate = { id: 'x' };
    await expect(submitPunchRegularization(input)).rejects.toThrow(/already waiting/);
  });
});

describe('withdraw - own pending only', () => {
  it('owner of the request withdraws it', async () => {
    request = { ...pending(), employeeId: ME };
    await expect(withdrawPunchRegularization(REQ_ID)).resolves.toEqual({ id: REQ_ID });
  });
  it("someone else's request is refused", async () => {
    await expect(withdrawPunchRegularization(REQ_ID)).rejects.toThrow(/Not permitted/);
  });
  it('a decided request cannot be withdrawn', async () => {
    request = { ...pending(), employeeId: ME, status: 'APPROVED' };
    await expect(withdrawPunchRegularization(REQ_ID)).rejects.toThrow(/already decided/);
  });
});

describe('decide - reviewers only', () => {
  it.each(['WORKER', 'QC', 'ATTENDANCE_OPERATOR', 'STORE_GUY'])('%s cannot approve or list', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(decidePunchRegularization(REQ_ID, true)).rejects.toThrow(/Not permitted/);
    await expect(listPunchRegularizations()).rejects.toThrow(/Not permitted/);
  });

  it.each(['SUPERVISOR', 'ADMIN', 'OWNER'])('%s approves: register row written, worker told', async (role) => {
    getMisRole.mockResolvedValue(role);
    await expect(decidePunchRegularization(REQ_ID, true)).resolves.toMatchObject({ status: 'APPROVED', attendanceId: 'att-1' });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: 'PRESENT', editedById: 'u1' }) }));
    expect(notificationCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'u-worker', type: 'mis.punch_regularization.decided' }) });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPROVE_PUNCH_REGULARIZATION' }));
  });

  it('reject needs a note, then records it without touching the register', async () => {
    getMisRole.mockResolvedValue('SUPERVISOR');
    await expect(decidePunchRegularization(REQ_ID, false, '')).rejects.toThrow(/reason/);
    await expect(decidePunchRegularization(REQ_ID, false, 'No proof')).resolves.toMatchObject({ status: 'REJECTED' });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('cannot decide your own request, nor one already decided', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    request = { ...pending(), employeeId: ME };
    await expect(decidePunchRegularization(REQ_ID, true)).rejects.toThrow(/your own/);
    request = { ...pending(), status: 'REJECTED' };
    await expect(decidePunchRegularization(REQ_ID, true)).rejects.toThrow(/already decided/);
  });
});
