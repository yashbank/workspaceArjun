import { describe, it, expect } from 'vitest';
import { describeBrowser } from './ua';

describe('describeBrowser', () => {
  it('falls back when the UA is missing', () => {
    expect(describeBrowser(null)).toBe('Unknown device');
    expect(describeBrowser('')).toBe('Unknown device');
  });

  it('detects Chrome on macOS', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
    expect(describeBrowser(ua)).toBe('Chrome on macOS');
  });

  it('detects Safari on iOS', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    expect(describeBrowser(ua)).toBe('Safari on iOS');
  });

  it('detects Edge on Windows (and not Chrome)', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0';
    expect(describeBrowser(ua)).toBe('Edge on Windows');
  });

  it('detects Firefox on Linux', () => {
    expect(describeBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0')).toBe(
      'Firefox on Linux',
    );
  });
});
