import { describe, expect, it } from 'vitest';

import { isUuid } from './ids';

describe('isUuid', () => {
  it('accepts a UUID in either case', () => {
    expect(isUuid('a9d4ff27-b07e-46d8-9fb7-c838bab51199')).toBe(true);
    expect(isUuid('A9D4FF27-B07E-46D8-9FB7-C838BAB51199')).toBe(true);
  });

  it('refuses everything else — including the values that used to crash a page', () => {
    for (const v of ['none', 'abc', '', ' ', '1', "x' OR 1=1", 'a9d4ff27b07e46d89fb7c838bab51199', 'a9d4ff27-b07e-46d8-9fb7-c838bab5119', 'a9d4ff27-b07e-46d8-9fb7-c838bab511999', 'a9d4ff27-b07e-46d8-9fb7-c838bab5119g', '../etc/passwd', null, undefined, 5, ['a9d4ff27-b07e-46d8-9fb7-c838bab51199']]) {
      expect(isUuid(v)).toBe(false);
    }
  });

  it('is not fooled by a trailing newline', () => {
    expect(isUuid('a9d4ff27-b07e-46d8-9fb7-c838bab51199\n')).toBe(false);
  });
});
