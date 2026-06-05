/**
 * Builds a version-aware thumbnail URL. Including the current version id as a
 * `?v=` key means the browser refetches the thumbnail when the file's current
 * version changes; together with the immutable cache header this makes repeat
 * loads instant. Falls back to a width-only URL when no version id is available.
 */
export function fileThumbnailUrl(
  fileId: string,
  versionKey?: string | null,
  width = 256,
): string {
  const base = `/api/files/${fileId}/thumbnail?w=${width}`;
  return versionKey ? `${base}&v=${encodeURIComponent(versionKey)}` : base;
}
