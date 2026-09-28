/**
 * A 500 was seen in production on login ("Something went wrong" — the root
 * boundary, because a LAYOUT throw skips this segment's own error.tsx).
 * `userHasDuplicateDisplayName` ran two raw DB queries with no try/catch of its
 * own; a hiccup there crashed every signed-in page, not just one screen. This
 * locks in the fix: that check failing must never crash the layout.
 */
import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn((url: string) => {
  throw new Error(`unexpected redirect to ${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'owner@x.com' } } }) },
  }),
}));

const getCurrentUser = vi.fn();
const hasPendingInviteForEmail = vi.fn();
vi.mock('@/server/auth', () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUser(...a),
  hasPendingInviteForEmail: (...a: unknown[]) => hasPendingInviteForEmail(...a),
}));

vi.mock('@/server/db', () => ({ isDatabaseConnectionError: () => false }));
vi.mock('@/components/shell/dashboard-shell', () => ({ DashboardShell: () => null }));
vi.mock('@/components/shell/keyboard-shortcuts', () => ({ KeyboardShortcuts: () => null }));
vi.mock('@/components/shell/global-keys', () => ({ GlobalKeys: () => null }));
vi.mock('@/components/shell/guided-tour', () => ({ GuidedTour: () => null }));
vi.mock('@/components/shell/route-prefetcher', () => ({ RoutePrefetcher: () => null }));
vi.mock('@/components/shell/security-alert-watcher', () => ({ SecurityAlertWatcher: () => null }));
vi.mock('@/components/shell/db-connection-issue', () => ({ DbConnectionIssue: () => null }));
vi.mock('@/components/shell/display-name-guard', () => ({ DisplayNameGuard: () => null }));
vi.mock('@/lib/user-display', () => ({ needsDisplayNameSetup: () => false }));

const userHasDuplicateDisplayName = vi.fn();
vi.mock('@/server/profile', () => ({ userHasDuplicateDisplayName: (...a: unknown[]) => userHasDuplicateDisplayName(...a) }));

vi.mock('@/server/access/decision', () => ({ resolveAccessDecision: vi.fn(), logAccessDenial: vi.fn() }));
vi.mock('@/server/access', () => ({ isAccessDetectionEnabled: () => false }));
vi.mock('@/server/settings', () => ({ getAccessEnforced: vi.fn() }));
vi.mock('@/server/mis/flags', () => ({ isMisEnabled: () => false }));

const { default: DashboardLayout } = await import('./layout');

const OWNER = { id: 'u1', email: 'owner@x.com', name: 'Owner', role: 'owner', status: 'active', accessMode: 'standard' };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue(OWNER);
  hasPendingInviteForEmail.mockResolvedValue(false);
  userHasDuplicateDisplayName.mockResolvedValue(false);
});

describe('DashboardLayout', () => {
  it('renders without redirecting when everything succeeds', async () => {
    const node = await DashboardLayout({ children: null });
    expect(isValidElement(node)).toBe(true);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('does not crash when the duplicate-display-name check fails', async () => {
    userHasDuplicateDisplayName.mockRejectedValue(new Error('connection string postgres://secret'));
    await expect(DashboardLayout({ children: null })).resolves.toBeDefined();
  });
});
