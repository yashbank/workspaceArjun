import { describe, expect, it } from 'vitest';

import { DICTIONARIES, LOCALES, type TranslationKey } from './dictionaries';
import { createTranslator, isLocale, resolveLabel, toLocale, translate } from './index';

describe('translate', () => {
  it('returns the English string by default', () => {
    expect(translate('action.save')).toBe('Save');
  });

  it('returns the Hindi string for the hi locale', () => {
    expect(translate('action.save', 'hi')).toBe('सेव करें');
  });

  it('falls back to English for an unknown locale', () => {
    // @ts-expect-error deliberately passing an unsupported locale
    expect(translate('action.save', 'te')).toBe('Save');
  });
});

describe('createTranslator', () => {
  it('binds the locale', () => {
    const t = createTranslator('hi');
    expect(t('nav.orders')).toBe('ऑर्डर');
  });
});

describe('locale coercion', () => {
  it('accepts supported locales', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('hi')).toBe(true);
  });

  it('rejects Telugu and anything else — it is out of scope', () => {
    expect(isLocale('te')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });

  it('coerces junk to English rather than throwing', () => {
    expect(toLocale('te')).toBe('en');
    expect(toLocale(undefined)).toBe('en');
    expect(toLocale('hi')).toBe('hi');
  });
});

describe('resolveLabel', () => {
  it('shows the Hindi label when present and the locale is Hindi', () => {
    expect(resolveLabel('Cutting', 'कटिंग', 'hi')).toBe('कटिंग');
  });

  it('falls back to the English label when the Hindi one is missing', () => {
    expect(resolveLabel('Komori 6 Color', null, 'hi')).toBe('Komori 6 Color');
    expect(resolveLabel('Komori 6 Color', '   ', 'hi')).toBe('Komori 6 Color');
  });

  it('ignores the Hindi label in English', () => {
    expect(resolveLabel('Cutting', 'कटिंग', 'en')).toBe('Cutting');
  });
});

describe('dictionary completeness', () => {
  it('every locale defines every key, so no screen can render blank', () => {
    const keys = Object.keys(DICTIONARIES.en) as TranslationKey[];
    for (const locale of LOCALES) {
      for (const key of keys) {
        expect(DICTIONARIES[locale][key], `${locale} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it('offers exactly two locales — Telugu is out of scope', () => {
    expect(LOCALES).toEqual(['en', 'hi']);
  });
});
