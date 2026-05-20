/** User-facing message when DB record exists but object storage blob is missing. */
export const STORAGE_CONTENT_MISSING_MESSAGE =
  'File content is missing from storage. Please re-upload or restore a valid version.';

export const STORAGE_CONTENT_MISSING_CODE = 'STORAGE_CONTENT_MISSING';

export function isStorageContentMissingPayload(
  payload: unknown,
): payload is { error: string; code?: string } {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as { error?: string; code?: string };
  return (
    p.code === STORAGE_CONTENT_MISSING_CODE ||
    p.error === STORAGE_CONTENT_MISSING_MESSAGE ||
    (typeof p.error === 'string' &&
      (p.error.includes('missing from storage') || p.error.includes('File content is missing')))
  );
}

export function parseApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = (payload as { error: unknown }).error;
    if (typeof err === 'string' && err.length > 0) return err;
  }
  return fallback;
}
