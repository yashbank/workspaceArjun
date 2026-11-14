'use client';

import { useState, useTransition, type CSSProperties } from 'react';

import { Button, Card, useToast } from '@/components/mis/kit';
import { FONT_PAIRS, PALETTES, themeVars, type OrgTheme } from '@/lib/mis/theme';
import { saveThemeAction } from '@/app/(mis)/mis/settings/theme/actions';

/** Owner-only. Picks a palette and a font pair, previews them live, saves org-wide. The server re-validates the ids. */
export function ThemeStudioScreen({ saved }: { saved: OrgTheme }) {
  const [theme, setTheme] = useState(saved);
  // What the server last stored: starts as the prop, moves on a successful save so Save disables again (R2-389).
  const [savedState, setSavedState] = useState(saved);
  const [pending, start] = useTransition();
  const { toast } = useToast();
  const vars = themeVars(theme);
  const font = FONT_PAIRS.find((f) => f.id === theme.fontPairId);
  const previewStyle = { ...vars, fontFamily: font?.body ?? undefined } as CSSProperties;
  const dirty = theme.paletteId !== savedState.paletteId || theme.fontPairId !== savedState.fontPairId;

  const save = () =>
    start(async () => {
      const res = await saveThemeAction(theme.paletteId, theme.fontPairId);
      if (res.ok) {
        setSavedState({ ...theme });
        toast('success', 'Theme saved for everyone.');
      } else toast('error', res.detail);
    });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-slate-900">Theme Studio</h1>
      <p className="text-sm text-slate-500">Colours and fonts for every screen, printout and badge. Applies to everyone. Every save is audited.</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-slate-900">Palette</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={theme.paletteId === p.id}
              onClick={() => setTheme({ ...theme, paletteId: p.id })}
              className={`flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-left text-sm ${theme.paletteId === p.id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200'}`}
            >
              <span aria-hidden="true" className="size-5 shrink-0 rounded-full" style={{ background: p.brand }} />
              {p.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-slate-900">Font pair</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FONT_PAIRS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={theme.fontPairId === f.id}
              onClick={() => setTheme({ ...theme, fontPairId: f.id })}
              className={`min-h-11 rounded-xl border bg-white px-3 py-2 text-left text-sm ${theme.fontPairId === f.id ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div style={previewStyle} className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Live preview">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Live preview</div>
        <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: font?.heading ?? undefined }}>Job card 1042</h2>
        <p className="mb-3 text-sm text-slate-600">Corrugated box, 5 ply. 1,200 pieces due Friday.</p>
        <Card className="mb-3 border-indigo-200 bg-indigo-50"><span className="text-sm font-medium text-indigo-700">In production</span></Card>
        <Button>Primary action</Button>
      </div>

      <div>
        <Button onClick={save} loading={pending} disabled={!dirty}>Save theme</Button>
      </div>
    </div>
  );
}
