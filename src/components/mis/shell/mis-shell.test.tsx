/**
 * 24G-part1 gap 1 — the phone top bar.
 *
 * Found in the walkthrough: every non-home phone page carried a tall strip ("Bhaskar Paper
 * Products / Signed in as Walkthrough OWNER / Owner badge / a second, full-size English|हिंदी
 * toggle") that is not in the design — R1–R5 only ever show that on the home screen's own
 * greeting card, with the small A|अ toggle. This pins the fix: a single ≤48px line (role chip
 * + name), and no second language toggle on the one screen whose own card already has one.
 */
import { render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let pathname = '/mis';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { MisShell } = await import('./mis-shell');

function renderPhoneHeader(path: string): HTMLElement {
  pathname = path;
  render(
    <MisShell
      factoryName="Bhaskar Paper Products"
      userId="u1"
      userName="A. Bhaskar"
      role="OWNER"
      locale="en"
      navAll={[]}
      onLocaleChange={vi.fn()}
    >
      <p>page body</p>
    </MisShell>,
  );
  // Both the desktop and the phone chrome are in the DOM at once (CSS alone decides which
  // shows — D1/D3), and DesktopShell draws its own <header> (the search bar) too. The phone
  // one is the second: DesktopShell renders first in the tree, the phone frame second.
  const headers = document.querySelectorAll('header');
  return headers[headers.length - 1] as HTMLElement;
}

describe('the phone top bar', () => {
  it('is one line, capped at 48px (h-12) — not the old factory-name/signed-in-as strip', () => {
    const header = renderPhoneHeader('/mis/masters');
    expect(header.className).toContain('h-12');
    expect(header.textContent).not.toMatch(/Bhaskar Paper Products/);
    expect(header.textContent).not.toMatch(/Signed in as/i);
  });

  it('carries the role chip and the name, on every non-home screen', () => {
    const header = renderPhoneHeader('/mis/masters');
    expect(within(header).getByText('Owner')).toBeTruthy();
    expect(within(header).getByText('A. Bhaskar')).toBeTruthy();
  });

  it('a non-home screen still gets the language toggle — it has no other one', () => {
    const header = renderPhoneHeader('/mis/masters');
    expect(within(header).getByRole('group', { name: /language/i })).toBeTruthy();
  });

  it('home does NOT duplicate the toggle — the greeting card carries its own A|अ', () => {
    const header = renderPhoneHeader('/mis');
    expect(within(header).queryByRole('group', { name: /language/i })).toBeNull();
  });
});
