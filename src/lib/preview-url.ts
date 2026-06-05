/**
 * Builds a version-aware preview URL for a file. Including the current version
 * id as a `?v=` cache key means the browser refetches the image whenever the
 * file's current version changes (after "Upload as new version" / "Replace").
 * Without it, the version-independent URL stays identical and the browser keeps
 * serving the cached old content. Falls back to the bare URL when no version id
 * is available.
 */
export function filePreviewUrl(fileId: string, versionKey?: string | null): string {
  const base = `/api/files/${fileId}/preview`;
  return versionKey ? `${base}?v=${encodeURIComponent(versionKey)}` : base;
}
