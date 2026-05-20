import { getSetting, setSetting } from '@/server/settings';
import {
  UPLOAD_FILE_TYPES,
  UPLOAD_LIMIT_OPTIONS,
  type UploadFileType,
  type UploadLimitOption,
} from '@/lib/upload-limits';

export {
  UPLOAD_FILE_TYPES,
  UPLOAD_LIMIT_OPTIONS,
  type UploadFileType,
  type UploadLimitOption,
};

export type UploadLimitsConfig = Record<UploadFileType, UploadLimitOption>;

const LIMIT_BYTES: Record<Exclude<UploadLimitOption, 'unlimited'>, number> = {
  '50mb': 50 * 1024 * 1024,
  '100mb': 100 * 1024 * 1024,
  '250mb': 250 * 1024 * 1024,
  '500mb': 500 * 1024 * 1024,
  '1gb': 1024 * 1024 * 1024,
  '2gb': 2 * 1024 * 1024 * 1024,
  '5gb': 5 * 1024 * 1024 * 1024,
};

export const DEFAULT_UPLOAD_LIMITS: UploadLimitsConfig = {
  pdf: '2gb',
  cdr: '5gb',
  jpg: '500mb',
  png: '500mb',
  zip: '2gb',
  other: '1gb',
};

const UPLOAD_LIMITS_KEY = 'upload_limits_json';

export function limitOptionToBytes(option: UploadLimitOption): number | null {
  if (option === 'unlimited') return null;
  return LIMIT_BYTES[option];
}

export function bytesToLimitOption(bytes: number): UploadLimitOption {
  const entries = Object.entries(LIMIT_BYTES) as [Exclude<UploadLimitOption, 'unlimited'>, number][];
  const match = entries.find(([, b]) => b === bytes);
  if (match) return match[0];
  if (bytes >= LIMIT_BYTES['5gb']) return '5gb';
  if (bytes >= LIMIT_BYTES['2gb']) return '2gb';
  if (bytes >= LIMIT_BYTES['1gb']) return '1gb';
  if (bytes >= LIMIT_BYTES['500mb']) return '500mb';
  if (bytes >= LIMIT_BYTES['250mb']) return '250mb';
  if (bytes >= LIMIT_BYTES['100mb']) return '100mb';
  return '50mb';
}

export function getFileTypeFromName(filename: string, mimeType?: string | null): UploadFileType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (ext === 'cdr') return 'cdr';
  if (ext === 'jpg' || ext === 'jpeg' || mimeType === 'image/jpeg') return 'jpg';
  if (ext === 'png' || mimeType === 'image/png') return 'png';
  if (ext === 'zip' || mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed') {
    return 'zip';
  }
  return 'other';
}

function parseUploadLimitsJson(raw: string | null): UploadLimitsConfig {
  if (!raw) return { ...DEFAULT_UPLOAD_LIMITS };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<string, string>>;
    const result = { ...DEFAULT_UPLOAD_LIMITS };
    for (const type of UPLOAD_FILE_TYPES) {
      const val = parsed[type];
      if (val && UPLOAD_LIMIT_OPTIONS.includes(val as UploadLimitOption)) {
        result[type] = val as UploadLimitOption;
      }
    }
    return result;
  } catch {
    return { ...DEFAULT_UPLOAD_LIMITS };
  }
}

export async function getUploadLimits(): Promise<UploadLimitsConfig> {
  const raw = await getSetting(UPLOAD_LIMITS_KEY);
  return parseUploadLimitsJson(raw);
}

export async function setUploadLimits(limits: UploadLimitsConfig): Promise<void> {
  for (const type of UPLOAD_FILE_TYPES) {
    if (!UPLOAD_LIMIT_OPTIONS.includes(limits[type])) {
      throw new Error(`Invalid limit for ${type}`);
    }
  }
  await setSetting(UPLOAD_LIMITS_KEY, JSON.stringify(limits));
}

export async function getMaxUploadBytesForFile(
  filename: string,
  mimeType?: string | null,
): Promise<number | null> {
  const limits = await getUploadLimits();
  const fileType = getFileTypeFromName(filename, mimeType);
  return limitOptionToBytes(limits[fileType]);
}

function formatSizeHuman(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function assertFileSizeWithinLimit(
  sizeBytes: number,
  filename: string,
  maxBytes: number | null,
  fileType: UploadFileType,
): void {
  if (maxBytes === null) return;
  if (sizeBytes > maxBytes) {
    throw new Error(
      `${fileType.toUpperCase()} files are limited to ${formatLimitLabel(bytesToLimitOption(maxBytes))}. This file is ${formatSizeHuman(sizeBytes)}.`,
    );
  }
}

function formatLimitLabel(option: UploadLimitOption): string {
  const labels: Record<UploadLimitOption, string> = {
    '50mb': '50 MB',
    '100mb': '100 MB',
    '250mb': '250 MB',
    '500mb': '500 MB',
    '1gb': '1 GB',
    '2gb': '2 GB',
    '5gb': '5 GB',
    unlimited: 'Unlimited',
  };
  return labels[option];
}
