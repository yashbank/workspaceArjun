import { describe, expect, it } from 'vitest';

import { assertTheme, DEFAULT_THEME, FONT_PAIRS, PALETTES, parseTheme, themeCss, themeVars } from './theme';

describe('Theme Studio allow-lists', () => {
  it('the default theme emits no CSS at all, so nothing changes for a site with nothing saved', () => {
    expect(themeVars(DEFAULT_THEME)).toEqual({});
    expect(themeCss(DEFAULT_THEME, '.mis-light')).toBe('');
    expect(parseTheme(null)).toEqual(DEFAULT_THEME);
  });

  it('a save refuses an id off the list, including CSS-shaped input', () => {
    expect(() => assertTheme({ paletteId: 'red;}body{display:none', fontPairId: 'inter' })).toThrow();
    expect(() => assertTheme({ paletteId: 'teal', fontPairId: 'url(x)' })).toThrow();
    expect(assertTheme({ paletteId: 'teal', fontPairId: 'classic' })).toEqual({ paletteId: 'teal', fontPairId: 'classic' });
  });

  it('a stored value that is garbage or off the list reads as the default, field by field', () => {
    expect(parseTheme('not json')).toEqual(DEFAULT_THEME);
    expect(parseTheme(JSON.stringify({ paletteId: '<script>', fontPairId: 'system' }))).toEqual({ paletteId: 'indigo', fontPairId: 'system' });
  });

  it('every palette and font pair builds CSS from list entries only', () => {
    for (const p of PALETTES) for (const f of FONT_PAIRS) {
      const css = themeCss({ paletteId: p.id, fontPairId: f.id }, '.x');
      expect(css).not.toMatch(/[<>]|url\(|@import/);
    }
    expect(themeVars({ paletteId: 'teal', fontPairId: 'inter' })['--color-indigo-600']).toBe('#0f766e');
  });
});
