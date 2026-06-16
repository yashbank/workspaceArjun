import { describe, it, expect } from 'vitest';
import { getFileTypeBadge } from './file-utils';

// UI-1: file-type badges collapse into five semantic color families. The label
// is always the uppercased extension (or "FILE" when there is none).
describe('getFileTypeBadge — five-family palette', () => {
  it('maps documents to the blue family', () => {
    for (const name of ['report.pdf', 'memo.docx', 'sheet.xlsx']) {
      expect(getFileTypeBadge(name).color).toContain('blue');
    }
    expect(getFileTypeBadge('report.pdf').label).toBe('PDF');
    expect(getFileTypeBadge('memo.docx').label).toBe('DOCX');
    expect(getFileTypeBadge('sheet.xlsx').label).toBe('XLSX');
  });

  it('maps images AND design files to the sky family', () => {
    for (const name of ['photo.png', 'logo.svg', 'art.psd', 'layout.cdr']) {
      expect(getFileTypeBadge(name).color).toContain('sky');
    }
    expect(getFileTypeBadge('logo.svg').label).toBe('SVG');
    expect(getFileTypeBadge('art.psd').label).toBe('PSD');
    expect(getFileTypeBadge('layout.cdr').label).toBe('CDR');
  });

  it('maps media to the violet family', () => {
    expect(getFileTypeBadge('clip.mp4').color).toContain('violet');
    expect(getFileTypeBadge('song.mp3').color).toContain('violet');
  });

  it('maps archives to the amber family', () => {
    for (const name of ['bundle.zip', 'old.rar', 'pack.7z']) {
      expect(getFileTypeBadge(name).color).toContain('amber');
    }
  });

  it('maps unknown extensions to the slate (other) family with an uppercased label', () => {
    const badge = getFileTypeBadge('mystery.xyz');
    expect(badge.color).toContain('slate');
    expect(badge.label).toBe('XYZ');
  });

  it('uses the FILE label and slate family when there is no extension', () => {
    const badge = getFileTypeBadge('README');
    expect(badge.label).toBe('FILE');
    expect(badge.color).toContain('slate');
  });
});
