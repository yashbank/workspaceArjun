export type UploadErrorCode =
  | 'permission'
  | 'presign'
  | 'storage_put'
  | 'storage_cors'
  | 'limit'
  | 'network'
  | 'cancelled'
  | 'unknown';

export function classifyApiUploadError(status: number, message?: string): { code: UploadErrorCode; message: string } {
  const lower = message?.toLowerCase() ?? '';
  if (status === 401) {
    return { code: 'permission', message: message ?? 'Sign in required to upload' };
  }
  if (status === 403) {
    return {
      code: 'permission',
      message: message ?? 'Permission denied — you cannot upload files in this workspace',
    };
  }
  if (status === 413 || lower.includes('limit') || lower.includes('quota') || lower.includes('exceed')) {
    return { code: 'limit', message: message ?? 'File exceeds the upload size limit' };
  }
  if (status === 502 || lower.includes('storage')) {
    return { code: 'presign', message: message ?? 'Could not prepare storage upload — try again' };
  }
  return { code: 'unknown', message: message ?? `Upload failed (${status})` };
}

export function classifyStoragePutError(status: number): { code: UploadErrorCode; message: string } {
  if (status === 0) {
    return {
      code: 'storage_cors',
      message: 'Network or CORS error reaching storage — check connection and retry',
    };
  }
  if (status === 403) {
    return {
      code: 'storage_put',
      message:
        'Storage rejected upload (403 Forbidden) — often a signed URL or permission issue. Retry; if it persists, contact support.',
    };
  }
  if (status === 400 || status === 405) {
    return {
      code: 'storage_put',
      message: `Storage rejected upload (${status}) — request may not match the signed URL`,
    };
  }
  return {
    code: 'storage_put',
    message: `Storage upload failed (${status})`,
  };
}

export function formatUploadError(err: unknown, status?: number): string {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return 'Upload cancelled';
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      return 'Network error — check your connection and try again';
    }
    return err.message;
  }
  if (status === 413) return 'File exceeds the upload size limit for this file type';
  if (status === 502) return 'Storage upload failed — try again or contact support';
  return 'Upload failed';
}
