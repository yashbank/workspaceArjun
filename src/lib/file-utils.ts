/** Known file extension → display label + color mappings. */
const EXT_MAP: Record<string, { label: string; color: string }> = {
  pdf: { label: 'PDF', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
  cdr: { label: 'CDR', color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400' },
  ai: { label: 'AI', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  psd: { label: 'PSD', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400' },
  eps: { label: 'EPS', color: 'bg-teal-500/15 text-teal-700 dark:text-teal-400' },
  svg: { label: 'SVG', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  png: { label: 'PNG', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  jpg: { label: 'JPG', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  jpeg: { label: 'JPEG', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  gif: { label: 'GIF', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  webp: { label: 'WEBP', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  heic: { label: 'HEIC', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  heif: { label: 'HEIF', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  tiff: { label: 'TIFF', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  doc: { label: 'DOC', color: 'bg-blue-600/15 text-blue-800 dark:text-blue-300' },
  docx: { label: 'DOCX', color: 'bg-blue-600/15 text-blue-800 dark:text-blue-300' },
  xls: { label: 'XLS', color: 'bg-green-600/15 text-green-800 dark:text-green-300' },
  xlsx: { label: 'XLSX', color: 'bg-green-600/15 text-green-800 dark:text-green-300' },
  csv: { label: 'CSV', color: 'bg-green-600/15 text-green-800 dark:text-green-300' },
  ppt: { label: 'PPT', color: 'bg-orange-600/15 text-orange-800 dark:text-orange-300' },
  pptx: { label: 'PPTX', color: 'bg-orange-600/15 text-orange-800 dark:text-orange-300' },
  zip: { label: 'ZIP', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  rar: { label: 'RAR', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  '7z': { label: '7Z', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400' },
  mp4: { label: 'MP4', color: 'bg-pink-500/15 text-pink-700 dark:text-pink-400' },
  mp3: { label: 'MP3', color: 'bg-pink-500/15 text-pink-700 dark:text-pink-400' },
  txt: { label: 'TXT', color: 'bg-gray-500/15 text-gray-700 dark:text-gray-400' },
};

const FALLBACK = { label: 'FILE', color: 'bg-gray-500/15 text-gray-700 dark:text-gray-400' };

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

export function getFileTypeBadge(filename: string): { label: string; color: string } {
  const ext = getExtension(filename);
  return EXT_MAP[ext] ?? (ext ? { label: ext.toUpperCase(), color: FALLBACK.color } : FALLBACK);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
