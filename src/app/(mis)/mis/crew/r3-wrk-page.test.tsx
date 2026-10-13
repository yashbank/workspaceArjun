/**
 * R3 B94: the crew page guards on production.read and survives bad query params.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { role: 'SUPERVISOR' as string };
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: async () => state.role }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/components/mis/forbidden', () => ({ Forbidden: function Forbidden() { return null; } }));
vi.mock('@/components/mis/machines/worker-board-screen', () => ({ WorkerBoardScreen: function WorkerBoardScreen() { return null; } }));

const listBookings = vi.fn(async () => []);
const availability = vi.fn(async () => []);
vi.mock('@/server/mis/worker-allocation', () => ({
  listActiveShifts: async () => [
    { id: '11111111-1111-4111-8111-111111111111', name: 'Shift 1', startTime: '06:00', endTime: '14:00', isDefault: true },
  ],
  listCrewBookings: (...a: unknown[]) => (listBookings as (...x: unknown[]) => unknown)(...a),
  getWorkerAvailability: (...a: unknown[]) => (availability as (...x: unknown[]) => unknown)(...a),
}));

const { default: CrewPage } = await import('./page');
const { Forbidden } = await import('@/components/mis/forbidden');

type Element = { type: unknown; props: Record<string, unknown> };
const render = async (params: Record<string, string> = {}) => (await CrewPage({ searchParams: Promise.resolve(params) })) as unknown as Element;

beforeEach(() => {
  vi.clearAllMocks();
  state.role = 'SUPERVISOR';
});

describe('crew page', () => {
  it.each(['ATTENDANCE_OPERATOR', 'SUPER_ATTENDANCE_OPERATOR', 'STORE_GUY', 'WORKER'])('%s gets Forbidden, not the error boundary', async (role) => {
    state.role = role;
    expect((await render()).type).toBe(Forbidden);
    expect(listBookings).not.toHaveBeenCalled();
  });

  it('?shift=abc and ?date=garbage fall back to the current shift and a valid day', async () => {
    const el = await render({ shift: 'abc', date: 'garbage', allocation: 'nope' });
    expect(el.props.currentShiftId).toBe('11111111-1111-4111-8111-111111111111');
    expect(el.props.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(el.props.openAllocationId).toBeNull();
  });

  it('a date beyond today+7 falls back to the default', async () => {
    const el = await render({ date: '2099-01-01' });
    expect(el.props.dateKey).not.toBe('2099-01-01');
  });

  it('an Owner can override, a Supervisor cannot', async () => {
    expect((await render()).props.canOverride).toBe(false);
    state.role = 'OWNER';
    expect((await render()).props.canOverride).toBe(true);
  });
});
