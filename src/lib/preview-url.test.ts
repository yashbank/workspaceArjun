import { describe, it, expect } from 'vitest';
import { filePreviewUrl } from './preview-url';

describe('filePreviewUrl', () => {
  it('appends the version id as a cache-busting query param', () => {
    expect(filePreviewUrl('file-1', 'ver-9')).toBe('/api/files/file-1/preview?v=ver-9');
  });

  it('falls back to the bare URL when no version id is given', () => {
    expect(filePreviewUrl('file-1')).toBe('/api/files/file-1/preview');
    expect(filePreviewUrl('file-1', null)).toBe('/api/files/file-1/preview');
    expect(filePreviewUrl('file-1', undefined)).toBe('/api/files/file-1/preview');
    expect(filePreviewUrl('file-1', '')).toBe('/api/files/file-1/preview');
  });

  it('url-encodes the version key', () => {
    expect(filePreviewUrl('file-1', 'a b/c')).toBe('/api/files/file-1/preview?v=a%20b%2Fc');
  });

  it('produces a different URL when the version changes (cache-busts)', () => {
    expect(filePreviewUrl('file-1', 'v1')).not.toBe(filePreviewUrl('file-1', 'v2'));
  });
});
