'use client';

import {
  FileSpreadsheet,
  FileText,
  Film,
  Pen,
  Smartphone,
} from 'lucide-react';
import { getExtension, getFileTypeBadge } from '@/lib/file-utils';

export function PremiumFileFallback({
  filename,
  variant = 'grid',
}: {
  filename: string;
  variant?: 'grid' | 'list' | 'preview';
}) {
  const ext = getExtension(filename);
  const badge = getFileTypeBadge(filename);

  if (ext === 'cdr') {
    return (
      <CdrFallback badge={badge} variant={variant} />
    );
  }
  if (ext === 'mov') {
    return <MovFallback variant={variant} />;
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return <SpreadsheetFallback badge={badge} variant={variant} />;
  }
  if (['heic', 'heif'].includes(ext)) {
    return <HeicFallback variant={variant} />;
  }
  if (ext === 'pdf' && variant === 'grid') {
    return <PdfCardFallback badge={badge} />;
  }

  return null;
}

function CdrFallback({
  badge,
  variant,
}: {
  badge: { label: string; color: string };
  variant: 'grid' | 'list' | 'preview';
}) {
  const iconCls = variant === 'list' ? 'h-4 w-4' : variant === 'preview' ? 'h-11 w-11' : 'h-8 w-8';
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-purple-50 to-purple-100/70 dark:from-purple-950/40 dark:to-purple-900/25 ${
        variant === 'list' ? 'rounded-lg px-1' : ''
      }`}
    >
      <Pen className={`${iconCls} text-purple-600 dark:text-purple-400`} />
      {variant !== 'list' && (
        <>
          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${badge.color}`}>
            {badge.label}
          </span>
          <span className="text-[8px] font-medium text-purple-800/60 dark:text-purple-200/50">CorelDRAW</span>
        </>
      )}
    </div>
  );
}

function MovFallback({ variant }: { variant: 'grid' | 'list' | 'preview' }) {
  const iconCls = variant === 'list' ? 'h-4 w-4' : variant === 'preview' ? 'h-11 w-11' : 'h-8 w-8';
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-pink-50 to-pink-100/70 dark:from-pink-950/40 dark:to-pink-900/25">
      <Film className={`${iconCls} text-pink-600 dark:text-pink-400`} />
      {variant !== 'list' && (
        <span className="text-[8px] font-bold uppercase tracking-wider text-pink-700/70 dark:text-pink-300/80">
          QuickTime
        </span>
      )}
    </div>
  );
}

function SpreadsheetFallback({
  badge,
  variant,
}: {
  badge: { label: string; color: string };
  variant: 'grid' | 'list' | 'preview';
}) {
  const iconCls = variant === 'list' ? 'h-4 w-4' : 'h-8 w-8';
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-emerald-50 to-emerald-100/60 dark:from-emerald-950/35 dark:to-emerald-900/20">
      <FileSpreadsheet className={`${iconCls} text-emerald-600 dark:text-emerald-400`} />
      {variant !== 'list' && (
        <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${badge.color}`}>{badge.label}</span>
      )}
    </div>
  );
}

function HeicFallback({ variant }: { variant: 'grid' | 'list' | 'preview' }) {
  const iconCls = variant === 'list' ? 'h-4 w-4' : 'h-8 w-8';
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-sky-50 to-sky-100/60 dark:from-sky-950/30 dark:to-sky-900/20">
      <Smartphone className={`${iconCls} text-sky-600 dark:text-sky-400`} />
      {variant !== 'list' && (
        <span className="text-[8px] font-bold uppercase tracking-wider opacity-70">iPhone</span>
      )}
    </div>
  );
}

function PdfCardFallback({ badge }: { badge: { label: string; color: string } }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br from-red-50 to-red-100/60 dark:from-red-950/30 dark:to-red-900/20">
      <FileText className="h-9 w-9 text-red-600 dark:text-red-400" />
      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${badge.color}`}>{badge.label}</span>
    </div>
  );
}
