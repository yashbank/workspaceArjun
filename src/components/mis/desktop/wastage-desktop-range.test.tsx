import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

import { resolveRange, type KeyRange } from '@/lib/mis/report-range';
import { buildWastage } from '@/lib/mis/wastage';
import { DesktopRangeTabs, WastageDesktop } from './wastage-desktop';

vi.mock('../kit/range-tabs', () => ({ RangeTabs: () => <span>range picker</span> }));

afterEach(cleanup);
const resize = (width: number) => act(() => { window.innerWidth = width; window.dispatchEvent(new Event('resize')); });

describe('the desktop wastage range picker', () => {
  it('mounts only at the lg width, so a phone holds one picker in the DOM, and follows a resize', () => {
    resize(375);
    render(<DesktopRangeTabs basePath="/mis/reports" range={{} as KeyRange} />);
    expect(screen.queryByText('range picker')).toBeNull();
    resize(1024);
    expect(screen.queryByText('range picker')).not.toBeNull();
    resize(1023);
    expect(screen.queryByText('range picker')).toBeNull();
  });
});

describe('a report cut to the range', () => {
  const report = buildWastage([], { timeZone: 'Asia/Kolkata', lastKey: '2026-03-31', weeks: 4, fromKey: '2026-03-01' });
  const keyRange = resolveRange({ freq: 'month', at: '2026-03-15' }, '2026-09-10');
  const view = { ...report, keyRange, exportFromKey: '2026-03-01', exportLastKey: '2026-03-31' };

  it('states the range, marks no week button, and the links carry no weeks', () => {
    const { container } = render(<WastageDesktop report={view} />);
    expect(container.textContent).toContain('01/03/2026 – 31/03/2026 · Mar 2026');
    const nav = screen.getByRole('navigation', { name: 'Period' });
    expect(nav.querySelector('[aria-current]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Wastage' }).getAttribute('href')).not.toContain('weeks=');
    expect(container.querySelector('input[name="weeks"]')).toBeNull();
  });

  it('a week button still sets weeks and keeps the range', () => {
    render(<WastageDesktop report={view} />);
    const href = screen.getByRole('link', { name: '13' }).getAttribute('href');
    expect(href).toContain('weeks=13');
    expect(href).toContain('freq=month');
  });

  it('the CSV is cut to the same days', () => {
    render(<WastageDesktop report={view} />);
    const href = screen.getByRole('link', { name: 'Export CSV' }).getAttribute('href')!;
    expect(href).toContain('from=2026-03-01');
    expect(href).toContain('last=2026-03-31');
    expect(href).not.toContain('weeks=');
  });
});
