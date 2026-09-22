/**
 * 24G-part1 gap 3 — R1's "Waiting on you" card: a square count badge beside the title (not a
 * big number underneath it), each row's age as a pill, and a full-width "Review approvals"
 * button that carries a check icon.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OwnerHome } from './owner-home';

const HEADER = { title: 'Good morning', meta: 'Monday, 7 September · 07:12' };
const YESTERDAY = { label: 'Yesterday · Sun 6 Sep', produced: 40850, waste: 18.5, machinesRun: 17, recorded: true };

describe('OwnerHome — "Waiting on you"', () => {
  it('reads the count off a square badge beside the title, not a big number below it', () => {
    render(
      <OwnerHome
        header={HEADER}
        approvals={{
          total: 2,
          rows: [
            { id: 'a', title: 'ORD-118 · Duplex carton', detail: 'waiting since 2 days', age: '2 days' },
            { id: 'b', title: 'ORD-121 · Notebook 200pg', detail: 'waiting since 4 hrs', age: '4 hrs' },
          ],
        }}
        alerts={[]}
        yesterday={YESTERDAY}
        wages={null}
      />,
    );
    const card = screen.getByText('Waiting on you').closest('section')!;
    expect(within(card).getByText('2')).toBeTruthy();
    expect(within(card).getByText('Nothing moves until you approve')).toBeTruthy();
    expect(within(card).getByText('ORD-118 · Duplex carton')).toBeTruthy();
    expect(within(card).getByText('2 days')).toBeTruthy();
    expect(within(card).getByText('4 hrs')).toBeTruthy();
  });

  it('the Review approvals button is full width, well over 44px (py-3.5 on text-base), and carries an icon before the label', () => {
    render(
      <OwnerHome
        header={HEADER}
        approvals={{ total: 1, rows: [{ id: 'a', title: 'ORD-118 · Duplex carton', detail: '' }] }}
        alerts={[]}
        yesterday={YESTERDAY}
        wages={null}
      />,
    );
    const link = screen.getByRole('link', { name: /Review approvals/ });
    expect(link.getAttribute('href')).toBe('/mis/approvals');
    expect(link.className).toContain('w-full');
    expect(link.className).toContain('py-3.5');
    expect(link.querySelector('svg')).toBeTruthy();
  });

  it('a row with no dated origin has no fabricated age pill', () => {
    render(
      <OwnerHome
        header={HEADER}
        approvals={{ total: 1, rows: [{ id: 'a', title: 'Leave for Ramesh', detail: '11-12 Sep' }] }}
        alerts={[]}
        yesterday={YESTERDAY}
        wages={null}
      />,
    );
    const card = screen.getByText('Waiting on you').closest('section')!;
    expect(within(card).getByText('Leave for Ramesh')).toBeTruthy();
    expect(within(card).queryByText(/^\d+ (hrs|min|days?)$/)).toBeNull();
  });

  it('nothing waiting draws the healthy state instead of the badge card', () => {
    render(
      <OwnerHome
        header={HEADER}
        approvals={{ total: 0, rows: [] }}
        alerts={[]}
        yesterday={YESTERDAY}
        wages={null}
      />,
    );
    expect(screen.getByText('Nothing is waiting on your approval.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Review approvals/ })).toBeNull();
  });
});
