/** Browser → S3 direct upload (presigned single PUT or multipart). */

export type UploadConfig = {
  directUpload: boolean;
  multipartThresholdBytes: number;
  partSizeBytes: number;
  limits: Record<string, number | null>;
};

export type UploadProgressCallback = (percent: number) => void;

type InitFileResponse = {
  mode: 'direct' | 'proxy';
  fileId: string;
  storageKey: string;
  method: 'single' | 'multipart';
  uploadUrl?: string;
  uploadId?: string;
  partSize?: number;
};

type InitVersionResponse = InitFileResponse & {
  versionNo: number;
};

let cachedConfig: UploadConfig | null = null;

export async function getUploadConfig(): Promise<UploadConfig> {
  if (cachedConfig) return cachedConfig;
  const res = await fetch('/api/files/upload/config', { credentials: 'include' });
  const data = (await res.json()) as UploadConfig & { error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Failed to load upload config');
  cachedConfig = data;
  return data;
}

export function clearUploadConfigCache(): void {
  cachedConfig = null;
}

function formatUploadError(err: unknown, status?: number): string {
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

async function parseApiError(res: Response): Promise<string> {
  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? formatUploadError(null, res.status);
}

function putWithProgress(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: UploadProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => xhr.abort());
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Storage upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during storage upload'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    xhr.send(body);
  });
}

async function uploadMultipart(
  file: File,
  init: InitFileResponse | InitVersionResponse,
  onProgress: UploadProgressCallback,
  signal: AbortSignal | undefined,
  partUrlPath: string,
): Promise<{ partNumber: number; etag: string }[]> {
  const partSize = init.partSize ?? 10 * 1024 * 1024;
  const totalParts = Math.ceil(file.size / partSize);
  const parts: { partNumber: number; etag: string }[] = [];
  let uploaded = 0;

  for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, file.size);
    const chunk = file.slice(start, end);

    const urlRes = await fetch(partUrlPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal,
      body: JSON.stringify({
        storageKey: init.storageKey,
        uploadId: init.uploadId,
        partNumber,
      }),
    });

    if (!urlRes.ok) throw new Error(await parseApiError(urlRes));
    const { url } = (await urlRes.json()) as { url: string };

    const etag = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      if (signal) {
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => xhr.abort());
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const raw = xhr.getResponseHeader('ETag') ?? xhr.getResponseHeader('etag');
          if (!raw) {
            reject(new Error('Missing ETag from storage'));
            return;
          }
          resolve(raw.replace(/"/g, ''));
        } else {
          reject(new Error(`Part ${partNumber} upload failed (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error(`Network error uploading part ${partNumber}`));
      xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
      xhr.send(chunk);
    });

    parts.push({ partNumber, etag });
    uploaded += chunk.size;
    onProgress(Math.min(99, Math.round((uploaded / file.size) * 100)));
  }

  onProgress(100);
  return parts;
}

async function proxyUploadFile(
  file: File,
  folderId: string | null,
  onProgress: UploadProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  if (folderId) formData.append('folderId', folderId);

  onProgress(10);

  const res = await fetch('/api/files', {
    method: 'POST',
    body: formData,
    signal,
    credentials: 'include',
  });

  if (!res.ok) throw new Error(await parseApiError(res));
  onProgress(100);
}

export async function uploadFileDirect(
  file: File,
  folderId: string | null,
  onProgress: UploadProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  await getUploadConfig();
  const mimeType = file.type || 'application/octet-stream';

  const initRes = await fetch('/api/files/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({
      name: file.name,
      mimeType,
      sizeBytes: file.size,
      folderId,
    }),
  });

  if (!initRes.ok) throw new Error(await parseApiError(initRes));
  const init = (await initRes.json()) as InitFileResponse;

  if (init.mode === 'proxy') {
    await proxyUploadFile(file, folderId, onProgress, signal);
    return;
  }

  try {
    if (init.method === 'single' && init.uploadUrl) {
      await putWithProgress(init.uploadUrl, file, mimeType, onProgress, signal);
    } else if (init.method === 'multipart' && init.uploadId) {
      const parts = await uploadMultipart(
        file,
        init,
        onProgress,
        signal,
        '/api/files/upload/part-url',
      );

      const completeRes = await fetch('/api/files/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal,
        body: JSON.stringify({
          fileId: init.fileId,
          storageKey: init.storageKey,
          sizeBytes: file.size,
          mimeType,
          uploadId: init.uploadId,
          parts,
        }),
      });

      if (!completeRes.ok) throw new Error(await parseApiError(completeRes));
    } else {
      throw new Error('Invalid upload session from server');
    }
  } catch (err) {
    await fetch('/api/files/upload/abort', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        fileId: init.fileId,
        storageKey: init.storageKey,
        uploadId: init.uploadId,
      }),
    }).catch(() => {});
    throw err;
  }
}

export async function uploadVersionDirect(
  file: File,
  fileId: string,
  note: string | undefined,
  onProgress: UploadProgressCallback,
  signal?: AbortSignal,
): Promise<void> {
  const mimeType = file.type || 'application/octet-stream';

  const initRes = await fetch(`/api/files/${fileId}/versions/upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    signal,
    body: JSON.stringify({ mimeType, sizeBytes: file.size }),
  });

  if (!initRes.ok) throw new Error(await parseApiError(initRes));
  const init = (await initRes.json()) as InitVersionResponse;

  if (init.mode === 'proxy') {
    const formData = new FormData();
    formData.append('file', file);
    if (note?.trim()) formData.append('note', note.trim());
    onProgress(10);
    const res = await fetch(`/api/files/${fileId}/versions`, {
      method: 'POST',
      body: formData,
      signal,
      credentials: 'include',
    });
    if (!res.ok) throw new Error(await parseApiError(res));
    onProgress(100);
    return;
  }

  try {
    if (init.method === 'single' && init.uploadUrl) {
      await putWithProgress(init.uploadUrl, file, mimeType, onProgress, signal);
    } else if (init.method === 'multipart' && init.uploadId) {
      const parts = await uploadMultipart(
        file,
        init,
        onProgress,
        signal,
        `/api/files/${fileId}/versions/upload/part-url`,
      );

      const completeRes = await fetch(`/api/files/${fileId}/versions/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal,
        body: JSON.stringify({
          versionNo: init.versionNo,
          storageKey: init.storageKey,
          sizeBytes: file.size,
          mimeType,
          note,
          uploadId: init.uploadId,
          parts,
        }),
      });

      if (!completeRes.ok) throw new Error(await parseApiError(completeRes));
    } else {
      throw new Error('Invalid upload session from server');
    }
  } catch (err) {
    await fetch(`/api/files/${fileId}/versions/upload/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        storageKey: init.storageKey,
        uploadId: init.uploadId,
      }),
    }).catch(() => {});
    throw err;
  }
}

export { formatUploadError };
