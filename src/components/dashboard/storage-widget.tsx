'use client';

import { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';

function formatStorage(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function StorageWidget({
  usedBytes,
  quotaBytes,
  fileCount,
}: {
  usedBytes: number;
  quotaBytes: number;
  fileCount: number;
}) {
  const [animatedPercent, setAnimatedPercent] = useState(0);
  const targetPercent = quotaBytes > 0 ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPercent(targetPercent), 150);
    return () => clearTimeout(timer);
  }, [targetPercent]);

  const isWarning = targetPercent > 80;
  const isCritical = targetPercent > 95;

  const ringColor = isCritical
    ? 'text-destructive'
    : isWarning
      ? 'text-amber-500'
      : 'text-primary';

  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (animatedPercent / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card p-4 shadow-card transition-all duration-250 hover:shadow-elevated hover:-translate-y-0.5">
      <div className="flex items-center gap-4">
        <div className="relative h-[76px] w-[76px] shrink-0">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="4.5"
              className="text-muted/20"
            />
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={`${ringColor} transition-all duration-[1200ms] ease-out`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-[15px] font-bold tabular-nums leading-none ${ringColor}`}>
              {Math.round(animatedPercent)}%
            </span>
            <span className="mt-0.5 text-[8px] text-muted-foreground/40">used</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <HardDrive className="h-3.5 w-3.5 text-muted-foreground/40" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Storage</span>
          </div>
          <p className="mt-1.5 text-sm font-bold tracking-tight">
            {formatStorage(usedBytes)}
          </p>
          <p className="text-[10px] text-muted-foreground/45">
            of {formatStorage(quotaBytes)} &middot; {fileCount} file{fileCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
