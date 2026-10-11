/**
 * F5 — MIS is light-only. The owner's phone is in dark mode: the theme provider puts `.dark` on
 * <html>, `--foreground` turns near-white, and MIS cards (hard-coded white) showed faint text.
 * MisShell wraps everything in `.mis-light`, and globals.css re-declares the light tokens for it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/mis/bom' }));

const { MisShell } = await import('./mis-shell');

describe('MisShell forced light scheme', () => {
  it('wraps the whole shell and its children in the .mis-light container', () => {
    const { getAllByText } = render(
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
    const wrapper = document.querySelector('[data-mis-light]') as HTMLElement;
    expect(wrapper).toBeTruthy();
    expect(wrapper.classList.contains('mis-light')).toBe(true);
    expect(getAllByText('page body').every((el) => wrapper.contains(el))).toBe(true);
  });
});

describe('globals.css light scope', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

  it('re-declares the light tokens for .mis-light and for html while MIS is mounted', () => {
    const light = css.match(/\.mis-light \{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(light).toContain('color-scheme: light');
    expect(light).toContain('--bpp-graphite: #1b1c1c');
    expect(css).toMatch(/html:has\(\.mis-light\) \{[\s\S]*?--bpp-graphite: #1b1c1c/);
  });

  it('maps faint slate-400/gray text to slate-500 only inside MIS, sparing dark panels', () => {
    expect(css).toMatch(
      /html:has\(\.mis-light\) :is\(\.text-slate-400, \.text-gray-400, \.text-gray-300\)/,
    );
    expect(css).toContain('bg-[#171310]');
  });

  it('leaves the legacy .dark tokens alone', () => {
    expect(css).toMatch(/\n\.dark \{[\s\S]*?--bpp-graphite: #f2f0f0/);
  });
});
