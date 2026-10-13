import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { allowedActions, can, MIS_ACTIONS } from '@/lib/mis/permissions';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

/**
 * R3-ATT B64: the three approved grants, and what they must not open. Written with the mis-permission-matrix
 * skill: every role is tried, and money stays server-side redacted for the newly widened STORE_GUY.
 */

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const BOM = {
  id: 'b1',
  orderId: 'o1',
  status: 'APPROVED',
  stages: [
    {
      id: 's1',
      seq: 1,
      process: { name: 'Printing' },
      materials: [{ id: 'm1', seq: 1, quantity: 10, item: { name: 'Ink', unit: 'Kg' }, ratePerUnit: 159.35 }],
    },
  ],
};
vi.mock('@/server/db', () => ({ db: { misBom: { findUnique: async () => structuredClone(BOM) } } }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/mis/notifications', () => ({ notifyRoles: vi.fn() }));

const { getBom } = await import('./bom');
const { getNavigationFor } = await import('./navigation');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

const GRANTS: Record<string, MisRoleName[]> = {
  'attendance.note': ['OWNER', 'ADMIN', 'SUPERVISOR', 'SUPER_ATTENDANCE_OPERATOR', 'ATTENDANCE_OPERATOR'],
};

describe('B64 the grants', () => {
  it.each(MIS_ROLES)('%s holds attendance.note exactly when written down', (role) => {
    expect(can(role, 'attendance.note')).toBe(GRANTS['attendance.note'].includes(role));
  });

  it('SUPERVISOR gains qc.write and STORE_GUY gains orders.read; nothing else about them moved', () => {
    expect(can('SUPERVISOR', 'qc.write')).toBe(true);
    expect(can('STORE_GUY', 'orders.read')).toBe(true);
    // still denied: the neighbours of each grant
    for (const a of ['qc.read'] as const) expect(can('STORE_GUY', a)).toBe(false);
    for (const a of ['orders.write', 'wages.read', 'production.read', 'attendance.read', 'employees.read'] as const) expect(can('STORE_GUY', a), a).toBe(false);
    for (const a of ['attendance.write', 'orders.write', 'wages.read', 'aql.read', 'settings.write'] as const) expect(can('SUPERVISOR', a), a).toBe(false);
  });

  it('attendance.note does not carry attendance.write: holders who only note cannot edit the register', () => {
    expect(can('SUPERVISOR', 'attendance.write')).toBe(false);
    expect(can('SUPERVISOR', 'attendance.note')).toBe(true);
  });

  it('completeness: every role resolves to a list of known actions, and OWNER holds all of them', () => {
    for (const role of MIS_ROLES) for (const a of allowedActions(role)) expect(MIS_ACTIONS).toContain(a);
    expect(allowedActions('OWNER')).toEqual([...MIS_ACTIONS]);
    expect(allowedActions('WORKER')).toEqual([]);
  });
});

describe('B64 STORE_GUY sees orders without money', () => {
  it('the nav offers Orders', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    expect((await getNavigationFor('u')).map((e) => e.id)).toContain('orders');
  });

  it('getBom answers STORE_GUY with quantities and no rate, price, amount or rupee anywhere', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    const bom = await getBom('o1');
    const text = JSON.stringify(bom);
    expect(text).toContain('Ink');
    expect(text).not.toMatch(/ratePerUnit|"rate"|amount|price|₹|159\.35/i);
  });

  it('the OWNER still receives the rate, so the redaction above is the role and not an empty fixture', async () => {
    getMisRole.mockResolvedValue('OWNER');
    expect(JSON.stringify(await getBom('o1'))).toContain('159.35');
  });

  it('the order detail page decides money from wages.read, not from orders.read', () => {
    const src = readFileSync(path.resolve(__dirname, '../../app/(mis)/mis/orders/[id]/page.tsx'), 'utf8');
    expect(src).toMatch(/canSeeWages = can\(role, 'wages\.read'\)/);
  });
});

describe('B64 UI wiring', () => {
  const read = (p: string) => readFileSync(path.resolve(__dirname, '../..', p), 'utf8');

  it("the QC page's Add Check follows qc.write, which SUPERVISOR now holds", () => {
    expect(read('app/(mis)/mis/qc/page.tsx')).toMatch(/can\(role, 'qc\.write'\)/);
  });

  it('the attendance screen offers Add note to attendance.note holders who cannot write', () => {
    expect(read('app/(mis)/mis/attendance/page.tsx')).toMatch(/canNote = can\(role, 'attendance\.note'\)/);
    expect(read('components/mis/attendance/attendance-screen.tsx')).toMatch(/canNote && !canWrite/);
  });
});
