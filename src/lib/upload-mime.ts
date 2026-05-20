import { getExtension } from '@/lib/file-utils';

/** Extension → canonical MIME for presign + storage (iOS often sends empty or octet-stream). */
const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  cdr: 'application/vnd.corel-draw',
  ai: 'application/postscript',
  eps: 'application/postscript',
  psd: 'image/vnd.adobe.photoshop',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  zip: 'application/zip',
};

const GENERIC_MIMES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/download',
]);

/**
 * Normalize MIME for upload init and storage PUT.
 * Prefer extension when the client sends empty or generic types (common on iOS Files).
 */
export function normalizeUploadMime(filename: string, clientMime?: string | null): string {
  const ext = getExtension(filename);
  const extMime = ext ? EXT_MIME[ext] : undefined;
  const raw = (clientMime ?? '').trim().toLowerCase();

  if (extMime) {
    if (GENERIC_MIMES.has(raw) || !raw) return extMime;
    if (ext === 'mov' && raw.startsWith('video/')) return extMime;
    if (ext === 'mp4' && raw.startsWith('video/')) return extMime;
    if ((ext === 'jpg' || ext === 'jpeg') && raw.startsWith('image/')) return extMime;
    if (ext === 'png' && raw.startsWith('image/')) return extMime;
    if (ext === 'pdf' && raw.includes('pdf')) return 'application/pdf';
    if (ext === 'cdr') return extMime;
  }

  if (raw && !GENERIC_MIMES.has(raw)) return raw;
  return extMime ?? 'application/octet-stream';
}

/** @deprecated Use normalizeUploadMime */
export function resolveUploadMimeType(file: File): string {
  return normalizeUploadMime(file.name, file.type);
}
