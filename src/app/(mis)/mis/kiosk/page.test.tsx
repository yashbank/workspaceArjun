/**
 * A 500 on this page was seen in production (reference no. 2170228806) — the data
 * load threw and nothing caught it, so the visitor got a raw crash page instead of
 * a factory-floor-appropriate "try again". This locks in the fix: a data-load
 * failure renders a retry state, while a genuine Forbidden still refuses properly.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireMisAccess = vi.fn();
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: (...a: unknown[]) => requireMisAccess(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
const listEmployeeRoster = vi.fn();
vi.mock('@/server/mis/employee', () => ({ listEmployeeRoster: (...a: unknown[]) => listEmployeeRoster(...a) }));
const listShifts = vi.fn();
const listAttendance = vi.fn();
vi.mock('@/server/mis/attendance', () => ({
  listShifts: (...a: unknown[]) => listShifts(...a),
  listAttendance: (...a: unknown[]) => listAttendance(...a),
}));
vi.mock('@/components/mis/kiosk/kiosk-screen', () => ({ KioskScreen: () => null }));

const { default: KioskPage } = await import('./page');
const { KioskScreen } = await import('@/components/mis/kiosk/kiosk-screen');

const asNode = (node: ReactNode) => (isValidElement(node) ? node : null);

beforeEach(() => {
  vi.clearAllMocks();
  requireMisAccess.mockResolvedValue({ id: 'u1' });
  listEmployeeRoster.mockResolvedValue([{ id: 'e1', name: 'A', employeeCode: 'EMP1', role: 'WORKER', isActive: true }]);
  listShifts.mockResolvedValue([{ id: 's1', name: 'Day' }]);
  listAttendance.mockResolvedValue([]);
});

describe('KioskPage', () => {
  it('renders the kiosk screen when everything loads', async () => {
    const node = asNode(await KioskPage());
    expect(node?.type).toBe(KioskScreen);
  });

  it.each([
    ['listEmployeeRoster', listEmployeeRoster],
    ['listShifts', listShifts],
    ['listAttendance', listAttendance],
  ])('shows a retry state, not a crash, when %s fails', async (_name, fn) => {
    fn.mockRejectedValue(new Error('connection string postgres://secret'));
    const node = asNode(await KioskPage());
    expect(node?.type).toBe('div');
    expect(node?.type).not.toBe(KioskScreen);
  });

  it('a Forbidden caller is still refused, not shown the generic retry state', async () => {
    requireMisAccess.mockRejectedValue(Object.assign(new Error('nope'), { name: 'MisForbiddenError' }));
    await expect(KioskPage()).rejects.toMatchObject({ name: 'MisForbiddenError' });
  });
});
