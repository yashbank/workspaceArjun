/**
 * Phase 20 · MIS-81 — the kit-level half of the touch-target audit.
 *
 * `button.test.tsx` already pins every `Button` variant at ≥44px (24G). This does the same for
 * the form controls MIS_UI_SPEC calls out separately: "48px inputs, 16px input text" — one test
 * per control, so a later class-string edit that drops `min-h-12` (48px) or the 16px `text-base`
 * fails here instead of surfacing as a re-discovered screen-by-screen finding (the class of bug
 * 24F/24G both found repeatedly). Checked against `design/screens/01-Foundations.png`'s own input
 * spec (48px height, 16px text) — not re-measured pixel-by-pixel, since the class names ARE the
 * contract every other kit consumer already relies on.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DateInput, Input, NumberInput, TimeInput } from './input';
import { Select } from './select';

describe('kit form controls — 48px tall, 16px text (MIS_UI_SPEC)', () => {
  it('Input carries min-h-12 and text-base', () => {
    render(<Input label="Name" onChange={() => {}} value="" />);
    const className = screen.getByLabelText('Name').className;
    expect(className).toContain('min-h-12');
    expect(className).toContain('text-base');
  });

  it('NumberInput carries min-h-12 and text-base', () => {
    render(<NumberInput label="Quantity" onChange={() => {}} value="" />);
    const className = screen.getByLabelText('Quantity').className;
    expect(className).toContain('min-h-12');
    expect(className).toContain('text-base');
  });

  it('DateInput carries min-h-12', () => {
    render(<DateInput label="Effective from" onChange={() => {}} value="" />);
    expect(screen.getByLabelText('Effective from').className).toContain('min-h-12');
  });

  it('TimeInput carries min-h-12', () => {
    render(<TimeInput label="Shift start" onChange={() => {}} value="" />);
    expect(screen.getByLabelText('Shift start').className).toContain('min-h-12');
  });

  it('Select carries min-h-12 (the plain <select> path, few options)', () => {
    render(<Select label="Role" value={null} options={[{ value: 'a', label: 'A' }]} onChange={() => {}} />);
    expect(screen.getByLabelText('Role').className).toContain('min-h-12');
  });
});
