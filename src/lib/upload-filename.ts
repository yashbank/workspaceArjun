/** Safe display/storage filename from browser File (strips paths, iOS quirks). */
export function sanitizeUploadFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? name;
  const trimmed = base.trim().normalize('NFC');
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    throw new Error('Invalid filename');
  }
  return trimmed.slice(0, 255);
}
