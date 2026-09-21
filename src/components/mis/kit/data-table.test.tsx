/**
 * Phase 24F · F-26 — the desktop table must not push the page sideways.
 *
 * Found in the browser: /mis/employees at 1440px was 275px wider than the window (a long e-mail address in the Login
 * column made the table wider than its column, and a table cannot shrink below its content). The table now sits in a
 * box that scrolls horizontally, so the excess stays inside the box. jsdom has no layout, so this asserts the class that
 * does the work — the walkthrough measured `scrollWidth - innerWidth` in a real browser.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from './data-table';

type Row = { id: string; name: string; email: string };
const rows: Row[] = [{ id: '1', name: 'Arjun', email: 'arjun.cr@bhaskarpaperproducts.example.com' }];
const columns = [
  { key: 'name', header: 'Name', render: (r: Row) => r.name },
  { key: 'email', header: 'Login', render: (r: Row) => r.email },
];

describe('DataTable', () => {
  it('wraps the desktop table in a box that scrolls sideways instead of widening the page', () => {
    const { container } = render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyTitle="None" />);
    const table = container.querySelector('table')!;
    const box = table.parentElement!;
    expect(box.className).toContain('overflow-x-auto');
    expect(box.className).toContain('hidden');
    expect(box.className).toContain('md:block');
  });

  it('renders each row once as a table row and once as a card', () => {
    const { container } = render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} emptyTitle="None" />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(screen.getAllByText('Arjun')).toHaveLength(2);
  });

  it('says so when there is nothing to show', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r: Row) => r.id} emptyTitle="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });
});
