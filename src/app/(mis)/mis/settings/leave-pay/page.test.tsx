/**
 * R2-102 — Settings > Leave pay: the Owner opens it; every other role is refused at the server read
 * (MisForbiddenError → the (mis) 403 boundary) and nothing reaches the browser. What the Owner's page
 * hands down carries no money (only PAID / UNPAID flags).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES } from '@/lib/mis/roles';
import { WAGE_DETECTOR, fakeDb, findLeaks, outcome, propsPayload, seedWorld } from '@/server/mis/testing/wage-world';

vi.mock('@/server/db', () => ({ db: fakeDb }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/components/mis/settings/leave-pay-screen', () => ({ LeavePayScreen: () => null }));
vi.mock('@/components/mis/common/page-back', () => ({ PageBack: () => null }));

const { default: LeavePayPage } = await import('./page');

beforeEach(() => {
  vi.clearAllMocks();
  seedWorld();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
});

describe('who opens Settings > Leave pay', () => {
  it('OWNER sees all five types, and the props carry no money', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const r = await outcome(() => LeavePayPage());
    expect(r).not.toBe('denied');
    const payload = propsPayload((r as { value: unknown }).value);
    expect(JSON.stringify(payload)).toContain('"leaveType":"LWP"');
    expect(findLeaks(payload, WAGE_DETECTOR())).toEqual([]);
  });

  it.each(MIS_ROLES.filter((r) => r !== 'OWNER'))('%s is refused', async (role) => {
    getMisRole.mockResolvedValue(role);
    expect(await outcome(() => LeavePayPage())).toBe('denied');
  });
});
