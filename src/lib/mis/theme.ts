/**
 * R8 T3 — Theme Studio: the allow-lists and the CSS they become. Pure (no Prisma/React).
 *
 * The saved theme is two ids, never CSS. Only ids from the lists below are accepted, and the CSS is built here
 * from the list entries, so nothing a user types ever reaches the <style> injected into every page.
 * The default theme emits nothing: a site with no saved theme renders exactly as before.
 */

export type Palette = { id: string; label: string; /** The one brand colour; every shade is mixed from it. */ brand: string };
export type FontPair = { id: string; label: string; heading: string | null; body: string | null };

export const DEFAULT_PALETTE_ID = 'indigo';
export const DEFAULT_FONT_PAIR_ID = 'inter';

// The brand hexes live here, once, and nowhere in a component. `indigo` is the Foundations brand (indigo-600).
export const PALETTES: readonly Palette[] = [
  { id: 'indigo', label: 'Indigo (default)', brand: '#4f46e5' },
  { id: 'teal', label: 'Teal', brand: '#0f766e' },
  { id: 'emerald', label: 'Emerald', brand: '#047857' },
  { id: 'sky', label: 'Sky', brand: '#0369a1' },
  { id: 'rose', label: 'Rose', brand: '#be123c' },
  { id: 'amber', label: 'Amber', brand: '#b45309' },
  { id: 'slate', label: 'Graphite', brand: '#334155' },
];

// Fonts already loaded by next/font in the root layout (Inter, Geist Mono) plus system stacks: no new font request.
const SERIF = "ui-serif, Georgia, 'Times New Roman', serif";
const SYSTEM = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const FONT_PAIRS: readonly FontPair[] = [
  { id: 'inter', label: 'Inter (default)', heading: null, body: null },
  { id: 'classic', label: 'Serif headings, Inter body', heading: SERIF, body: null },
  { id: 'system', label: 'System UI', heading: SYSTEM, body: SYSTEM },
  { id: 'technical', label: 'Mono headings, Inter body', heading: 'var(--font-geist-mono), ui-monospace, monospace', body: null },
  { id: 'editorial', label: 'Serif headings, System body', heading: SERIF, body: SYSTEM },
];

export type OrgTheme = { paletteId: string; fontPairId: string };
export const DEFAULT_THEME: OrgTheme = { paletteId: DEFAULT_PALETTE_ID, fontPairId: DEFAULT_FONT_PAIR_ID };

export const isPaletteId = (v: unknown): v is string => typeof v === 'string' && PALETTES.some((p) => p.id === v);
export const isFontPairId = (v: unknown): v is string => typeof v === 'string' && FONT_PAIRS.some((p) => p.id === v);

/** Strict, for a save: anything off the lists is refused. */
export function assertTheme(input: { paletteId?: unknown; fontPairId?: unknown }): OrgTheme {
  if (!isPaletteId(input.paletteId)) throw new Error('Choose a colour palette from the list.');
  if (!isFontPairId(input.fontPairId)) throw new Error('Choose a font pair from the list.');
  return { paletteId: input.paletteId, fontPairId: input.fontPairId };
}

/** Lenient, for a read of stored text: a bad or missing value falls back to the default, field by field. */
export function parseTheme(raw: string | null | undefined): OrgTheme {
  try {
    const o = JSON.parse(raw ?? '') as Record<string, unknown>;
    return {
      paletteId: isPaletteId(o?.paletteId) ? o.paletteId : DEFAULT_PALETTE_ID,
      fontPairId: isFontPairId(o?.fontPairId) ? o.fontPairId : DEFAULT_FONT_PAIR_ID,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

// shade -> % of the brand colour; the rest is white (lighter) or black (darker). 600 is the brand itself.
const SHADES: Record<number, [number, 'white' | 'black']> = {
  50: [8, 'white'], 100: [15, 'white'], 200: [28, 'white'], 300: [45, 'white'], 400: [70, 'white'], 500: [85, 'white'],
  600: [100, 'white'], 700: [80, 'black'], 800: [62, 'black'], 900: [45, 'black'], 950: [30, 'black'],
};

/** CSS custom properties for a theme. Empty for the default theme. Tailwind's `indigo-*` utilities read `--color-indigo-*`. */
export function themeVars(theme: OrgTheme): Record<string, string> {
  const vars: Record<string, string> = {};
  const palette = PALETTES.find((p) => p.id === theme.paletteId);
  if (palette && palette.id !== DEFAULT_PALETTE_ID) {
    for (const [shade, [pct, mix]] of Object.entries(SHADES)) {
      vars[`--color-indigo-${shade}`] = pct === 100 ? palette.brand : `color-mix(in oklab, ${palette.brand} ${pct}%, ${mix})`;
    }
    vars['--primary'] = palette.brand;
    vars['--ring'] = palette.brand;
  }
  const font = FONT_PAIRS.find((p) => p.id === theme.fontPairId);
  if (font?.body) vars['--mis-font-body'] = font.body;
  if (font?.heading) vars['--mis-font-heading'] = font.heading;
  return vars;
}

/** The <style> text for `selector` (the page scope). '' when the theme is the default. */
export function themeCss(theme: OrgTheme, selector: string): string {
  const vars = Object.entries(themeVars(theme));
  if (vars.length === 0) return '';
  const body = vars.map(([k, v]) => `${k}:${v}`).join(';');
  return `${selector}{${body}}${selector}{font-family:var(--mis-font-body,inherit)}:is(${selector}) :is(h1,h2,h3){font-family:var(--mis-font-heading,inherit)}`;
}
