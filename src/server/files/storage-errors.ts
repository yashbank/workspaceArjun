import { STORAGE_CONTENT_MISSING_MESSAGE } from '@/lib/storage-errors';

export { STORAGE_CONTENT_MISSING_MESSAGE };

export class StorageContentMissingError extends Error {
  readonly code = 'STORAGE_CONTENT_MISSING' as const;

  constructor(
    public readonly fileId: string,
    public readonly storageKey: string | null,
  ) {
    super(STORAGE_CONTENT_MISSING_MESSAGE);
    this.name = 'StorageContentMissingError';
  }
}

export function isStorageContentMissingError(
  error: unknown,
): error is StorageContentMissingError {
  return error instanceof StorageContentMissingError;
}

export function logMissingStorageObject(
  context: string,
  meta: { fileId: string; storageKey: string | null; versionId?: string },
): void {
  console.warn(`[storage.missing] ${context}`, meta);
}
