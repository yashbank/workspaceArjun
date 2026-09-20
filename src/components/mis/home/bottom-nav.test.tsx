/**
 * Phase 14 · MIS-40 — role-based navigation: the five-tab bar of MIS_UI_SPEC §4.5.
 *
 * The spec table is written out here by hand, so a tab cannot change role, order or
 * destination without an edit in this file. Three further guarantees sit on top:
 * no role is shown a tab its own permissions cannot open (a dead-end 403), every
 * destination page exists, and a badge can only ever attach to a tab that is on screen.
 */
import { render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { can, type MisAction } from '@/lib/mis/permissions';
import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

let pathname = '/mis';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { BottomNav, tabsForRole } = await import('./bottom-nav');

/** MIS_UI_SPEC §4.5, verbatim. */
const SPEC: Record<MisRoleName, string[]> = {
  OWNER: ['Home', 'Approvals', 'Orders', 'Reports', 'Settings'],
  ADMIN: ['Home', 'Orders', 'Masters', 'People', 'Reports'],
  SUPERVISOR: ['Home', 'Machines', 'Jobs', 'Crew', 'Me'],
  QC: ['Home', 'Checks', 'Defects', 'COA', 'Me'],
  ATTENDANCE_OPERATOR: ['Home', 'Register', 'Leave', 'Kiosk', 'Me'],
  SUPER_ATTENDANCE_OPERATOR: ['Home', 'Register', 'Leave', 'Kiosk', 'Me'],
  STORE_GUY: ['Home', 'Stock', 'Receive', 'Issue', 'Me'],
  WORKER: ['Home'],
};

/** What each destination needs before it will show data — read from the page and its server functions. */
const NEEDS: Record<string, MisAction | null> = {
  '/mis': null,
  '/mis/me': null,
  '/mis/approvals': 'orders.read',
  '/mis/orders': 'orders.read',
  '/mis/reports': 'reports.read',
  '/mis/settings': 'settings.read',
  '/mis/masters': 'masters.read',
  '/mis/employees': 'employees.read',
  '/mis/machine-board': 'production.read',
  '/mis/production': 'production.read',
  '/mis/crew': 'attendance.read',
  '/mis/qc': 'qc.read',
  '/mis/qc/grid': 'qc.read',
  '/mis/documents': 'orders.read',
  '/mis/attendance': 'attendance.read',
  '/mis/attendance/leave': 'attendance.read',
  '/mis/kiosk': 'attendance.write',
  '/mis/store/stock': 'store.read',
  '/mis/store/receive': 'store.read',
  '/mis/store/issue': 'store.read',
};

describe('§4.5 — the tab set per role', () => {
  it.each(MIS_ROLES)('%s sees exactly the tabs the spec lists, in order', (role) => {
    expect(tabsForRole(role).map((t) => t.label)).toEqual(SPEC[role]);
  });

  it('a user with no MIS role gets Home only', () => {
    expect(tabsForRole(null).map((t) => t.label)).toEqual(['Home']);
  });

  it('five tabs, never six (a sixth does not fit a 360px thumb) — except a login-less WORKER', () => {
    for (const role of MIS_ROLES.filter((r) => r !== 'WORKER')) expect(tabsForRole(role)).toHaveLength(5);
  });

  it('tab ids are unique within a role, so a badge has exactly one place to land', () => {
    for (const role of MIS_ROLES) {
      const ids = tabsForRole(role).map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('the wage-and-approval surfaces are Owner tabs only: no other role gets Approvals or Settings', () => {
    for (const role of MIS_ROLES.filter((r) => r !== 'OWNER')) {
      const labels = tabsForRole(role).map((t) => t.label);
      expect(labels, role).not.toContain('Approvals');
      expect(labels, role).not.toContain('Settings');
    }
  });
});

describe('every tab opens for the role that is shown it', () => {
  const cases = MIS_ROLES.flatMap((role) => tabsForRole(role).map((tab) => [role, tab.label, tab.href] as const));

  it('the table names every destination in use (a new href needs a NEEDS entry)', () => {
    const unlisted = cases.map((c) => c[2]).filter((href) => !(href in NEEDS));
    expect(unlisted).toEqual([]);
  });

  it.each(cases)('%s · %s → %s is permitted for that role (no tab leads to a refusal)', (role, _label, href) => {
    const needs = NEEDS[href];
    if (needs) expect(can(role, needs), `${role} sees ${href} but lacks ${needs}`).toBe(true);
  });

  it.each([...new Set(cases.map((c) => c[2]))])('the page behind %s exists', (href) => {
    const segments = href.replace(/^\/mis\/?/, '');
    const file = path.join(process.cwd(), 'src/app/(mis)/mis', segments, 'page.tsx');
    expect(existsSync(file), file).toBe(true);
  });
});

describe('badges', () => {
  const nav = readFileSync(path.join(process.cwd(), 'src/server/mis/navigation.ts'), 'utf8');
  const start = nav.indexOf('export async function getNavBadges');
  const body = nav.slice(start);

  it('every badge key getNavBadges can return is a tab that role actually has', () => {
    const blocks = [...body.matchAll(/case '([A-Z_]+)':(?:\s*case '([A-Z_]+)':)?\s*\{([\s\S]*?)\n      \}/g)];
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    for (const [, roleA, roleB, block] of blocks) {
      const keys = [...block.matchAll(/return \{ (\w+):/g)].map((m) => m[1]);
      expect(keys.length, `${roleA} case has no badge key`).toBeGreaterThan(0);
      for (const role of [roleA, roleB].filter(Boolean) as MisRoleName[]) {
        const ids = tabsForRole(role).map((t) => t.id);
        for (const key of keys) expect(ids, `${role}: badge '${key}' has no tab`).toContain(key);
      }
    }
  });

  it('renders five links, marks the current page, and caps a badge at 99+', () => {
    pathname = '/mis/approvals';
    render(<BottomNav role="OWNER" badges={{ approvals: 120, orders: 3 }} />);
    const bar = screen.getByRole('navigation', { name: 'Sections' });
    const links = within(bar).getAllByRole('link');
    expect(links).toHaveLength(5);
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.textContent)).toEqual(['99+Approvals']);
    expect(within(bar).getByText('3')).toBeTruthy();
  });

  it('Home is current only on /mis exactly, not on every page beneath it', () => {
    pathname = '/mis/orders/123';
    const { container } = render(<BottomNav role="ADMIN" />);
    const current = [...container.querySelectorAll('[aria-current="page"]')].map((e) => e.textContent);
    expect(current).toEqual(['Orders']);
  });

  it('a zero badge draws nothing', () => {
    pathname = '/mis';
    const { container } = render(<BottomNav role="OWNER" badges={{ approvals: 0 }} />);
    expect(container.textContent).not.toMatch(/\b0\b/);
  });
});
