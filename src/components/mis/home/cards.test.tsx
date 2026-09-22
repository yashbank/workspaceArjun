/**
 * 24G-part1 gap 2 — the A|अ toggle on every role home's greeting card (`HeaderCard`) measured
 * 40x40 in the walkthrough, under the 44px tap-target rule. `LangPill` is `h-10 w-10`
 * (Tailwind's 2.5rem = 40px); the fix is `h-11 w-11` (2.75rem = 44px).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HeaderCard } from './cards';

describe('HeaderCard — the home greeting card\'s language toggle', () => {
  it('each language option is at least a 44px square hit area', () => {
    render(<HeaderCard title="Good morning" meta="Monday, 7 September · 07:12" />);
    const group = screen.getByRole('group', { name: /language/i });
    for (const button of Array.from(group.querySelectorAll('button'))) {
      expect(button.className).toContain('h-11');
      expect(button.className).toContain('w-11');
      expect(button.className).not.toMatch(/\bh-10\b/);
      expect(button.className).not.toMatch(/\bw-10\b/);
    }
  });

  it('offers exactly the two scripts', () => {
    render(<HeaderCard title="Good morning" meta="Monday, 7 September · 07:12" />);
    const group = screen.getByRole('group', { name: /language/i });
    expect(Array.from(group.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['A', 'अ']);
  });
});
