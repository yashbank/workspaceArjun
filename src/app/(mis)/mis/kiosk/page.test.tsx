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
const propsOf = (node: ReactNode) =>
  isValidElement(node) ? (node.props as { employees: { id: string; attendance: { clockIn: Date | null; clockOut: Date | null } | null }[] }) : null;

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

/**
 * A night shift wrapping midnight keeps its early-morning punches on the PREVIOUS
 * work-date (workDateFor, attendance-day.ts). This page used to ask for only
 * "today", so anyone still clocked in from a shift that started before the
 * factory's midnight rollover went invisible — counts and status looked frozen
 * however many times the screen was refreshed. Locks in the yesterday+today merge.
 */
describe('KioskPage — a work-date that wraps midnight', () => {
  it('yesterday, still open (clocked in, not out), overrides an empty today', async () => {
    listAttendance.mockImplementation(async () => {
      const calls = listAttendance.mock.calls.length;
      // Promise.all evaluates listAttendance(today) then listAttendance(yesterday), in that
      // source order, before either resolves — so the 2nd call is always "yesterday" here.
      return calls === 2
        ? [{ employeeId: 'e1', clockIn: new Date('2026-09-29T00:30:00Z'), clockOut: null, status: 'PRESENT' }]
        : [];
    });
    const node = asNode(await KioskPage());
    const emp = propsOf(node)?.employees.find((e) => e.id === 'e1');
    expect(emp?.attendance?.clockIn).toEqual(new Date('2026-09-29T00:30:00Z'));
    expect(emp?.attendance?.clockOut).toBeNull();
  });

  it("today's own row still wins over a CLOSED yesterday row — stale data never clobbers fresh activity", async () => {
    listAttendance.mockImplementation(async () => {
      const calls = listAttendance.mock.calls.length;
      if (calls === 1) return [{ employeeId: 'e1', clockIn: new Date('2026-09-29T09:00:00Z'), clockOut: null, status: 'PRESENT' }];
      return [{ employeeId: 'e1', clockIn: new Date('2026-09-28T22:00:00Z'), clockOut: new Date('2026-09-29T06:00:00Z'), status: 'PRESENT' }];
    });
    const node = asNode(await KioskPage());
    const emp = propsOf(node)?.employees.find((e) => e.id === 'e1');
    expect(emp?.attendance?.clockIn).toEqual(new Date('2026-09-29T09:00:00Z'));
    expect(emp?.attendance?.clockOut).toBeNull();
  });
});
