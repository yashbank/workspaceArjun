/**
 * D12's page: Owner only, and ABSENT (a 404) for the other seven roles rather than refused on open (`wages.read`,
 * D24/D25). Two layouts only — phone below 1024px, desktop from 1024px — and any explicit `?view` is the phone screen.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

class NotFound extends Error {}
vi.mock('next/navigation', () => ({ notFound: () => { throw new NotFound('NEXT_NOT_FOUND'); } }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const getBusinessRules = vi.fn(async () => []);
vi.mock('@/server/mis/business-rules', () => ({ getBusinessRules: () => getBusinessRules() }));
vi.mock('@/components/mis/settings/settings-screen', () => ({ SettingsScreen: () => null }));
vi.mock('@/components/mis/desktop/rules-desktop-server', () => ({ RulesDesktopServer: () => null }));

const { default: RulesPage } = await import('./page');
const { SettingsScreen } = await import('@/components/mis/settings/settings-screen');
const { RulesDesktopServer } = await import('@/components/mis/desktop/rules-desktop-server');

const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
const kids = (node: ReactNode): ReactNode[] => (isValidElement(node) ? ([] as ReactNode[]).concat((node.props as { children?: ReactNode }).children ?? []) : []);
const typesIn = (node: ReactNode): unknown[] => {
  if (!isValidElement(node)) return [];
  return [node.type, ...kids(node).flatMap(typesIn)];
};

beforeEach(() => vi.clearAllMocks());

describe('who reaches the page — every role tried', () => {
  it.each(MIS_ROLES.map((r) => [r] as const))('%s', async (role: MisRoleName) => {
    getMisRole.mockResolvedValue(role);
    if (role === 'OWNER') await expect(RulesPage({ searchParams: sp() })).resolves.toBeTruthy();
    else {
      await expect(RulesPage({ searchParams: sp() })).rejects.toBeInstanceOf(NotFound);
      expect(getBusinessRules).not.toHaveBeenCalled(); // absent means no query was made on their behalf
    }
  });
});

describe('the two layouts', () => {
  it('phone below 1024px (lg:hidden) and the desktop widget from 1024px (hidden lg:block)', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const tree = (await RulesPage({ searchParams: sp({ asOf: '2026-08-01', rule: 'AQL_MAJOR_MAX', scheduled: '1' }) })) as ReactNode;
    const [phone, desktop] = kids(tree) as React.ReactElement<{ className: string; children: ReactNode }>[];
    expect(phone.props.className).toBe('lg:hidden');
    expect(desktop.props.className).toBe('hidden lg:block');
    expect(typesIn(phone)).toContain(SettingsScreen);
    const server = kids(desktop)[0] as React.ReactElement<Record<string, unknown>>;
    expect(server.type).toBe(RulesDesktopServer);
    expect(server.props).toMatchObject({ asOf: '2026-08-01', rule: 'AQL_MAJOR_MAX', scheduled: true });
  });

  it('the "scheduled" confirmation is passed only when the redirect said so', async () => {
    getMisRole.mockResolvedValue('OWNER');
    for (const [scheduled, expected] of [['1', true], ['0', false], [undefined, false]] as const) {
      const tree = (await RulesPage({ searchParams: sp(scheduled === undefined ? {} : { scheduled }) })) as ReactNode;
      const desktop = kids(tree)[1] as React.ReactElement<{ children: ReactNode }>;
      expect((kids(desktop)[0] as React.ReactElement<Record<string, unknown>>).props.scheduled).toBe(expected);
    }
  });

  it('any explicit ?view is the phone screen at every width — no desktop widget at all', async () => {
    getMisRole.mockResolvedValue('OWNER');
    const tree = (await RulesPage({ searchParams: sp({ view: 'classic' }) })) as ReactNode;
    expect(typesIn(tree)).toContain(SettingsScreen);
    expect(typesIn(tree)).not.toContain(RulesDesktopServer);
  });
});
