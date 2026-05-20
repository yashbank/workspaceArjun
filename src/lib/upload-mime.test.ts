import { describe, it, expect } from 'vitest';
import { normalizeUploadMime } from './upload-mime';

describe('normalizeUploadMime', () => {
  it('maps MOV with empty type to video/quicktime', () => {
    expect(normalizeUploadMime('IMG_2649.MOV', '')).toBe('video/quicktime');
  });

  it('maps MOV with octet-stream to video/quicktime', () => {
    expect(normalizeUploadMime('clip.mov', 'application/octet-stream')).toBe('video/quicktime');
  });

  it('maps CDR safely', () => {
    expect(normalizeUploadMime('design.cdr', '')).toBe('application/vnd.corel-draw');
  });

  it('treats DJ and dj filenames distinctly by extension', () => {
    expect(normalizeUploadMime('photo.jpg', '')).toBe('image/jpeg');
    expect(normalizeUploadMime('doc.pdf', 'application/octet-stream')).toBe('application/pdf');
  });
});
