import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const saveThemeAction = vi.fn(async (_p: string, _f: string): Promise<{ ok: true } | { ok: false; detail: string }> => ({ ok: true }));
vi.mock('@/app/(mis)/mis/settings/theme/actions', () => ({ saveThemeAction: (p: string, f: string) => saveThemeAction(p, f) }));

const { ThemeStudioScreen } = await import('./theme-studio-screen');
const { ToastProvider } = await import('@/components/mis/kit');

afterEach(() => { cleanup(); saveThemeAction.mockClear(); });
const setup = () => render(<ToastProvider><ThemeStudioScreen saved={{ paletteId: 'indigo', fontPairId: 'inter' }} /></ToastProvider>);
const saveBtn = () => screen.getByRole('button', { name: /save theme/i }) as HTMLButtonElement;

describe('Theme Studio save button (R2-389)', () => {
  it('is disabled until something changes, disables again after a successful save, and re-enables on a new change', async () => {
    setup();
    expect(saveBtn().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^Teal/ }));
    expect(saveBtn().disabled).toBe(false);
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveBtn().disabled).toBe(true));
    expect(saveThemeAction).toHaveBeenCalledWith('teal', 'inter');
    fireEvent.click(screen.getByRole('button', { name: /^Rose/ }));
    expect(saveBtn().disabled).toBe(false);
  });

  it('stays enabled when the save fails', async () => {
    saveThemeAction.mockResolvedValueOnce({ ok: false, detail: 'nope' });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Teal/ }));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(saveThemeAction).toHaveBeenCalled());
    await waitFor(() => expect(saveBtn().disabled).toBe(false));
  });
});
