import { describe, it, expect } from 'vitest';
import { fileThumbnailUrl } from './thumbnail-url';

describe('fileThumbnailUrl', () => {
  it('builds a width + version url', () => {
    expect(fileThumbnailUrl('file-1', 'ver-9', 256)).toBe(
      '/api/files/file-1/thumbnail?w=256&v=ver-9',
    );
  });

  it('defaults the width to 256', () => {
    expect(fileThumbnailUrl('file-1', 'ver-9')).toBe(
      '/api/files/file-1/thumbnail?w=256&v=ver-9',
    );
  });

  it('uses the provided width', () => {
    expect(fileThumbnailUrl('file-1', 'ver-9', 96)).toBe(
      '/api/files/file-1/thumbnail?w=96&v=ver-9',
    );
  });

  it('omits the version key when not provided', () => {
    expect(fileThumbnailUrl('file-1')).toBe('/api/files/file-1/thumbnail?w=256');
    expect(fileThumbnailUrl('file-1', null, 96)).toBe('/api/files/file-1/thumbnail?w=96');
    expect(fileThumbnailUrl('file-1', '')).toBe('/api/files/file-1/thumbnail?w=256');
  });

  it('url-encodes the version key', () => {
    expect(fileThumbnailUrl('file-1', 'a b/c', 96)).toBe(
      '/api/files/file-1/thumbnail?w=96&v=a%20b%2Fc',
    );
  });
});
