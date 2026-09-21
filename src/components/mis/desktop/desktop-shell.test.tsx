/**
 * Phase 24 · D3 — the desktop frame.
 *
 * The rules under test are the ones a screenshot cannot enforce: two layouts from one
 * component tree, a rail that never greys anything out, and 44px targets that do not relax
 * on a laptop.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NavEntry } from '@/server/mis/navigation';

let pathname = '/mis/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { DesktopShell, DesktopPageHeader } = await import('./desktop-shell');

const NAV: NavEntry[] = [
  { id: 'orders', labelKey: 'nav.orders', href: '/mis/orders', icon: 'clipboard', primary: true },
  { id: 'quality', labelKey: 'nav.quality', href: '/mis/qc', icon: 'check', primary: true },
  { id: 'attendance', labelKey: 'nav.attendance', href: '/mis/attendance', icon: 'users', primary: true },
  { id: 'settings', labelKey: 'nav.settings', href: '/mis/settings', icon: 'settings', primary: false },
];

function renderShell(nav: NavEntry[] = NAV, badges?: Record<string, number>) {
  return render(
    <DesktopShell factoryName="Bhaskar Paper Products" userName="A. Bhaskar" role="OWNER" nav={nav} navBadges={badges}>
      <p>page body</p>
    </DesktopShell>,
  );
}

describe('the frame', () => {
  it('is absent below 1024px and present from there up — the whole two-layout rule, in one class', () => {
    const { container } = renderShell();
    const frame = container.firstElementChild!;
    expect(frame.className).toContain('hidden');
    expect(frame.className).toContain('lg:flex');
  });

  it('the sidebar is a 68px rail that widens to 240px at 1280 — one element, not two layouts', () => {
    renderShell();
    const aside = screen.getByRole('complementary');
    expect(aside.className).toContain('w-[68px]');
    expect(aside.className).toContain('xl:w-60');
  });

  it('renders the page body it was given, once', () => {
    renderShell();
    expect(screen.getAllByText('page body')).toHaveLength(1);
  });

  it('carries the search, and labels it for assistive tech', () => {
    renderShell();
    expect(screen.getByRole('searchbox')).toBeTruthy();
  });
});

describe('the rail — absent, never disabled', () => {
  it('shows a link for every permitted entry, plus the dashboard itself', () => {
    renderShell();
    const nav = screen.getByRole('navigation');
    const hrefs = within(nav).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/mis/dashboard', '/mis/orders', '/mis/qc', '/mis/attendance', '/mis/settings']);
  });

  it('shows nothing the server did not permit — a shorter menu is simply shorter', () => {
    renderShell([NAV[0]]);
    const nav = screen.getByRole('navigation');
    const hrefs = within(nav).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/mis/dashboard', '/mis/orders']);
    expect(hrefs).not.toContain('/mis/settings');
  });

  it('never renders a disabled or aria-disabled item — D3: nothing in this rail is ever greyed out', () => {
    const { container } = renderShell();
    expect(container.querySelectorAll('[disabled]')).toHaveLength(0);
    expect(container.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
  });

  it('marks the current page, and only it', () => {
    pathname = '/mis/orders';
    const { container } = renderShell();
    const current = [...container.querySelectorAll('[aria-current="page"]')].map((e) => e.getAttribute('href'));
    expect(current).toEqual(['/mis/orders']);
    pathname = '/mis/dashboard';
  });

  it('every rail target is at least 44px tall, on a laptop as on the floor', () => {
    renderShell();
    for (const link of within(screen.getByRole('navigation')).getAllByRole('link')) {
      expect(link.className).toContain('min-h-11');
    }
  });

  it('carries a visible focus ring — the rail is keyboard-reachable', () => {
    renderShell();
    for (const link of within(screen.getByRole('navigation')).getAllByRole('link')) {
      expect(link.className).toContain('focus-visible:ring-2');
    }
  });
});

describe('counts', () => {
  it('a badge names the item AND its count on hover, in the same word the expanded rail uses', () => {
    renderShell(NAV, { quality: 4 });
    const link = screen.getByRole('link', { name: /Quality/ });
    expect(link.getAttribute('title')).toBe('Quality · 4');
  });

  it('an item with no count is titled with just its label', () => {
    renderShell(NAV, { quality: 4 });
    expect(screen.getByRole('link', { name: /Orders/ }).getAttribute('title')).toBe('Orders');
  });

  it('caps a large count rather than stretching the rail', () => {
    renderShell(NAV, { quality: 250 });
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('a zero count draws no badge at all', () => {
    renderShell(NAV, { quality: 0 });
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('DesktopPageHeader', () => {
  it('puts the count in the line under the title, not in the title', () => {
    render(<DesktopPageHeader title="Orders" summary="12 open · 3 due this week · 1 overdue" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Orders');
    expect(screen.getByText(/12 open/)).toBeTruthy();
  });

  it('renders the one primary action and any quiet ones beside it', () => {
    render(
      <DesktopPageHeader
        title="Orders"
        secondary={<button type="button">Export</button>}
        primary={<button type="button">New order</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'New order' })).toBeTruthy();
  });

  it('a header with no actions renders just the title', () => {
    render(<DesktopPageHeader title="Reports" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
