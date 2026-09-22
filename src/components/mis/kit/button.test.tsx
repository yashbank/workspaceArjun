/**
 * The shared kit `Button` — MIS_UI_SPEC §4.3 and the 44px tap-target rule.
 *
 * 24G-part1 gap 6 / cross-flagged by 24G-part2 (G2-11): the `primary` variant was
 * `bg-slate-900` (near-black) — the one primary action in the app that did not read as the
 * spec's indigo. This pins the fix and the 44px minimum every Button variant must keep.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button — variant colour (MIS_UI_SPEC §4.3)', () => {
  it('primary is indigo-600, not the old near-black slate-900', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toContain('bg-indigo-600');
    expect(button.className).not.toContain('bg-slate-900');
  });

  it('primary is indigo even when passed explicitly', () => {
    render(<Button variant="primary">Confirm</Button>);
    expect(screen.getByRole('button', { name: 'Confirm' }).className).toContain('bg-indigo-600');
  });

  it('danger stays red — only primary was wrong', () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-red-600');
  });
});

describe('Button — every variant is at least 44px tall', () => {
  it.each(['primary', 'secondary', 'danger', 'ghost'] as const)('%s carries min-h-11', (variant) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('min-h-11');
  });
});
