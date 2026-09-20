/**
 * Phase 14 · MIS-40 — the language toggle: optimistic on tap, persisted behind it, exactly two
 * options (English · हिंदी — Telugu is out of scope, S7), and a re-tap of the active language
 * writes nothing.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LangToggle } from './lang-toggle';
import { MisLocaleProvider } from './locale-provider';

function setup(initial: 'en' | 'hi' = 'en') {
  const persist = vi.fn(async () => undefined);
  render(
    <MisLocaleProvider initialLocale={initial}>
      <LangToggle onPersist={persist} />
    </MisLocaleProvider>,
  );
  return persist;
}

describe('LangToggle', () => {
  it('offers exactly two languages, each in its own script', () => {
    setup();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['English', 'हिंदी']);
  });

  it('the server-provided language is the one marked active on first paint (no flash of English)', () => {
    setup('hi');
    expect(screen.getByRole('button', { name: 'हिंदी' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('tapping the other language switches immediately and persists that language once', () => {
    const persist = setup('en');
    fireEvent.click(screen.getByRole('button', { name: 'हिंदी' }));
    expect(screen.getByRole('button', { name: 'हिंदी' }).getAttribute('aria-pressed')).toBe('true');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('hi');
  });

  it('tapping the language already active writes nothing', () => {
    const persist = setup('en');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(persist).not.toHaveBeenCalled();
  });

  it('the group is labelled for assistive tech', () => {
    setup();
    expect(screen.getByRole('group').getAttribute('aria-label')).toBeTruthy();
  });

  it('each option is at least 44px tall (the tap-target rule)', () => {
    setup();
    for (const b of screen.getAllByRole('button')) expect(b.className).toContain('min-h-11');
  });
});
