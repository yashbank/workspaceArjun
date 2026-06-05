/** Safe display/storage filename from browser File (strips paths, iOS quirks). */
export function sanitizeUploadFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const trimmed = base.trim().normalize('NFC');
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    throw new Error('Invalid filename');
  }
  return trimmed.slice(0, 255);
}

/**
 * Inserts a " (copy)" suffix before the extension — used by the duplicate
 * "Keep both" action so the new upload doesn't collide with the existing name.
 * e.g. "report.pdf" → "report (copy).pdf", "archive.tar.gz" → "archive.tar (copy).gz",
 * "README" → "README (copy)".
 */
export function withCopySuffix(name: string): string {
  const parts = name.split('.');
  const ext = parts.length > 1 ? '.' + parts.pop() : '';
  const baseName = parts.join('.');
  return `${baseName} (copy)${ext}`;
}
