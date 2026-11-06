import { describe, expect, it } from 'vitest';

import { detectMac, isSearchShortcut, searchHint } from './platform';

describe('shortcut platform', () => {
  it('detects Mac from userAgentData first, then navigator.platform', () => {
    expect(detectMac({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe(true);
    expect(detectMac({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(false);
    expect(detectMac({ platform: 'MacIntel' })).toBe(true);
    expect(detectMac({ platform: 'Linux x86_64' })).toBe(false);
  });
  it('words the hint per platform', () => {
    expect(searchHint(true)).toBe('⌘K');
    expect(searchHint(false)).toBe('Ctrl K');
  });
  it('accepts metaKey on Mac and ctrlKey elsewhere only', () => {
    expect(isSearchShortcut({ key: 'k', metaKey: true, ctrlKey: false }, true)).toBe(true);
    expect(isSearchShortcut({ key: 'k', metaKey: false, ctrlKey: true }, true)).toBe(false);
    expect(isSearchShortcut({ key: 'K', metaKey: false, ctrlKey: true }, false)).toBe(true);
    expect(isSearchShortcut({ key: 'k', metaKey: true, ctrlKey: false }, false)).toBe(false);
    expect(isSearchShortcut({ key: 'j', metaKey: true, ctrlKey: false }, true)).toBe(false);
  });
});
