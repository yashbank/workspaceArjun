import { describe, it, expect } from 'vitest';
import { isThumbnailable } from './thumbnail';

describe('isThumbnailable', () => {
  it('is true for supported raster image extensions', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff']) {
      expect(isThumbnailable(ext)).toBe(true);
    }
  });

  it('is false for unsupported / non-image types', () => {
    for (const ext of [
      'svg',
      'heic',
      'heif',
      'mp4',
      'mov',
      'pdf',
      'cdr',
      'xlsx',
      'ai',
      'psd',
      'eps',
    ]) {
      expect(isThumbnailable(ext)).toBe(false);
    }
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isThumbnailable('PNG')).toBe(true);
    expect(isThumbnailable(' JPG ')).toBe(true);
    expect(isThumbnailable('')).toBe(false);
  });
});
