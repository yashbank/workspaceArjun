export const UPLOAD_FILE_TYPES = ['pdf', 'cdr', 'jpg', 'png', 'zip', 'other'] as const;
export type UploadFileType = (typeof UPLOAD_FILE_TYPES)[number];

export const UPLOAD_LIMIT_OPTIONS = [
  '50mb',
  '100mb',
  '250mb',
  '500mb',
  '1gb',
  '2gb',
  '5gb',
  'unlimited',
] as const;
export type UploadLimitOption = (typeof UPLOAD_LIMIT_OPTIONS)[number];

export const FILE_TYPE_LABELS: Record<UploadFileType, string> = {
  pdf: 'PDF',
  cdr: 'CDR',
  jpg: 'JPG',
  png: 'PNG',
  zip: 'ZIP',
  other: 'Other',
};

export function formatLimitLabel(option: UploadLimitOption): string {
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
