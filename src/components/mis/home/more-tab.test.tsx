/**
 * D32 (F-27) — the phone "More" tab: the fifth tab for Owner / Admin / Supervisor, opening a sheet that
 * lists every screen the role may open. Other roles are untouched.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

let pathname = '/mis';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/server/mis/roles', () => ({ getMisRole: vi.fn() }));

const { BottomNav, barForRole, tabsForRole } = await import('./bottom-nav');
const { navigationForRole } = await import('@/server/mis/navigation');

const MORE_ROLES: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR'];
const FIXED_ROLES = MIS_ROLES.filter((r) => !MORE_ROLES.includes(r));
const moreFor = (role: MisRoleName) => navigationForRole(role, 'phone');

beforeEach(() => {
  pathname = '/mis';
});

describe('the bar — five tabs, More as the fifth for three roles', () => {
  it.each(MORE_ROLES)('%s: four tabs then More — five, never six', (role) => {
    const bar = barForRole(role, moreFor(role));
    expect(bar.more).toBe(true);
    expect(bar.tabs).toHaveLength(4);
    expect(bar.tabs.map((t) => t.label)).toEqual(tabsForRole(role).slice(0, 4).map((t) => t.label));
  });

  it.each(FIXED_ROLES)('%s keeps its current tabs and has NO More tab', (role) => {
    const bar = barForRole(role, moreFor(role));
    expect(bar.more).toBe(false);
    expect(bar.tabs).toEqual(tabsForRole(role));
    render(<BottomNav role={role} more={moreFor(role)} />);
    expect(screen.queryByRole('button', { name: /all screens/i })).toBeNull();
    expect(screen.queryByText('More')).toBeNull();
  });

  it('the tab More displaces is in its list: Owner Settings, Admin Reports, Supervisor Me', () => {
    const list = (r: MisRoleName) => moreFor(r).map((e) => e.href);
    expect(barForRole('OWNER', moreFor('OWNER')).tabs.map((t) => t.label)).not.toContain('Settings');
    expect(list('OWNER')).toContain('/mis/settings');
    expect(barForRole('ADMIN', moreFor('ADMIN')).tabs.map((t) => t.label)).not.toContain('Reports');
    expect(list('ADMIN')).toContain('/mis/reports');
    expect(barForRole('SUPERVISOR', moreFor('SUPERVISOR')).tabs.map((t) => t.label)).not.toContain('Me');
    expect(list('SUPERVISOR')).toContain('/mis/me');
  });

  it('with no list to show, the spec five stay (a bar is never left without its fifth destination)', () => {
    expect(barForRole('OWNER', []).tabs).toEqual(tabsForRole('OWNER'));
    expect(barForRole('OWNER').more).toBe(false);
  });

  it('draws four links and one More button, inside the lg:hidden bar', () => {
    render(<BottomNav role="OWNER" more={moreFor('OWNER')} />);
    const bar = screen.getByRole('navigation', { name: 'Sections' });
    expect(bar.className).toContain('lg:hidden');
    expect(within(bar).getAllByRole('link')).toHaveLength(4);
    const more = within(bar).getByRole('button');
    expect(more.textContent).toBe('More');
    expect(more.getAttribute('aria-label')).toBeTruthy();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(more.getAttribute('aria-haspopup')).toBe('dialog');
  });
});

describe('the sheet', () => {
  function open(role: MisRoleName = 'OWNER') {
    const utils = render(<BottomNav role={role} more={moreFor(role)} />);
    fireEvent.click(screen.getByRole('button', { name: /all screens/i }));
    return utils;
  }

  it('is closed until More is tapped, then is a labelled dialog and More reports expanded', () => {
    render(<BottomNav role="OWNER" more={moreFor('OWNER')} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /all screens/i }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBeTruthy();
    expect(screen.getByRole('button', { name: /all screens/i }).getAttribute('aria-expanded')).toBe('true');
  });

  it('lists every screen the role may open, as links, each at least 44px tall', () => {
    open('OWNER');
    const dialog = screen.getByRole('dialog');
    const links = within(dialog).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/mis/settings', '/mis/store', '/mis/grn', '/mis/po', '/mis/inventory', '/mis/suppliers']),
    );
    expect(links).toHaveLength(moreFor('OWNER').length);
    for (const link of links) {
      expect(link.className, link.textContent ?? '').toContain('min-h-11');
      expect(link.querySelector('svg'), 'icon').toBeTruthy();
      expect(link.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it('groups the list under headings, and shows an Admin no wage screen', () => {
    open('ADMIN');
    const dialog = screen.getByRole('dialog');
    const headings = within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(expect.arrayContaining(['Store & purchasing', 'People & attendance', 'Production & quality']));
    const hrefs = within(dialog).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/mis/reports');
    expect(hrefs).not.toContain('/mis/payroll');
    expect(hrefs).not.toContain('/mis/settings/rules');
  });

  it("lists Supervisor's Me and no Purchase Orders (the table gives Supervisor no po.read)", () => {
    open('SUPERVISOR');
    const hrefs = within(screen.getByRole('dialog')).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/mis/me');
    expect(hrefs).not.toContain('/mis/po');
  });

  it('closes on Escape', () => {
    open();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /all screens/i }).getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a backdrop tap', () => {
    open();
    const backdrop = document.querySelector('[aria-hidden="true"].absolute.inset-0');
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when the route changes', () => {
    const { rerender } = open();
    expect(screen.getByRole('dialog')).toBeTruthy();
    pathname = '/mis/store';
    rerender(<BottomNav role="OWNER" more={moreFor('OWNER')} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes when a link in it is followed', () => {
    open();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('link', { name: 'Store' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('More is highlighted only for a page it owns', () => {
  const isLit = () =>
    screen.getByRole('button', { name: /all screens/i }).getAttribute('data-active') === 'true';

  it('lit on a screen only More reaches (Owner on Store)', () => {
    pathname = '/mis/store/stock';
    render(<BottomNav role="OWNER" more={moreFor('OWNER')} />);
    expect(isLit()).toBe(true);
  });

  it("lit on the tab it displaced (Owner on Settings; Supervisor on Me)", () => {
    pathname = '/mis/settings/users';
    const a = render(<BottomNav role="OWNER" more={moreFor('OWNER')} />);
    expect(isLit()).toBe(true);
    a.unmount();
    pathname = '/mis/me';
    render(<BottomNav role="SUPERVISOR" more={moreFor('SUPERVISOR')} />);
    expect(isLit()).toBe(true);
  });

  it('not lit on Home, nor on a page that is one of the four visible tabs (Owner on Orders)', () => {
    pathname = '/mis';
    const a = render(<BottomNav role="OWNER" more={moreFor('OWNER')} />);
    expect(isLit()).toBe(false);
    a.unmount();
    pathname = '/mis/orders/123';
    render(<BottomNav role="OWNER" more={moreFor('OWNER')} />);
    expect(isLit()).toBe(false);
  });
});
