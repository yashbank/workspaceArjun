// File-type badges collapse into a small, restrained set of semantic color
// families (lower saturation than a per-extension rainbow). The badge label is
// always the uppercased extension (or "FILE" when there is none).
const DOCUMENT_EXTS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt']);
const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'heic', 'heif',
  // Design/vector source files share the Images family.
  'cdr', 'ai', 'eps', 'psd',
]);
const MEDIA_EXTS = new Set(['mp4', 'mov', 'webm', 'm4v', 'mp3', 'wav']);
const ARCHIVE_EXTS = new Set(['zip', 'rar', '7z', 'tar', 'gz']);

const FAMILY_COLORS = {
  documents: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  images: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  media: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  archives: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  other: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
} as const;

function badgeColor(ext: string): string {
  if (DOCUMENT_EXTS.has(ext)) return FAMILY_COLORS.documents;
  if (IMAGE_EXTS.has(ext)) return FAMILY_COLORS.images;
  if (MEDIA_EXTS.has(ext)) return FAMILY_COLORS.media;
  if (ARCHIVE_EXTS.has(ext)) return FAMILY_COLORS.archives;
  return FAMILY_COLORS.other;
}

export function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 1) return '';
  return filename.slice(dot + 1).toLowerCase();
}

export function getFileTypeBadge(filename: string): { label: string; color: string } {
  const ext = getExtension(filename);
  return { label: ext ? ext.toUpperCase() : 'FILE', color: badgeColor(ext) };
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
