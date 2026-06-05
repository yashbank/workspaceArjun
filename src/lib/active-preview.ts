/**
 * Resolves the file object to show in the preview panel, keeping it in sync with
 * the latest list data. When a preview is open and the file list refreshes (e.g.
 * a version restore/replace changed `currentVersionId`), this returns the fresh
 * object from `files` so the preview reflects the current version. Falls back to
 * the originally-captured object if the file is no longer in the list, and
 * returns null when nothing is being previewed. Pure — derive it during render
 * (no effect, no update loop).
 */
export function resolveActivePreview<T extends { id: string }>(
  previewFile: T | null,
  files: T[],
): T | null {
  if (!previewFile) return null;
  return files.find((f) => f.id === previewFile.id) ?? previewFile;
}
