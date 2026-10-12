import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PasswordInput } from './password-input';

describe('PasswordInput', () => {
  it('is hidden by default and the toggle shows then hides it', () => {
    render(<PasswordInput id="pw" aria-label="Password" autoComplete="current-password" defaultValue="secret" />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('current-password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input.type).toBe('text');
    expect(input.value).toBe('secret');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input.type).toBe('password');
  });
  it('the toggle is a 44px non-submit button and props pass through', () => {
    render(<PasswordInput aria-label="Password" required minLength={8} className="x" />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.className).toContain('h-11');
    expect(btn.className).toContain('w-11');
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(input.minLength).toBe(8);
    expect(input.className).toContain('x');
  });
});
