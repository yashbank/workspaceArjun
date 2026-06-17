import type { ActivityDayPoint, FileTypeSlice } from '@/server/dashboard/load-dashboard-data';

const TYPE_META: Record<string, { label: string; color: string }> = {
  image: { label: 'Images', color: '#0ea5e9' },
  pdf: { label: 'PDFs', color: '#ef4444' },
  video: { label: 'Videos', color: '#ec4899' },
  design: { label: 'Design', color: '#a855f7' },
  archive: { label: 'Archives', color: '#f59e0b' },
  document: { label: 'Documents', color: '#3b82f6' },
  other: { label: 'Other', color: '#94a3b8' },
};

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="mt-3 flex h-32 items-center justify-center rounded-xl border border-dashed border-border/40 text-xs text-muted-foreground/40">
      {label}
    </div>
  );
}

function fmtDay(iso?: string): string {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Lightweight SVG area+line chart of events per day (last 30 days). */
export function ActivityLineChart({ data }: { data: ActivityDayPoint[] }) {
  const W = 600;
  const H = 160;
  const padX = 6;
  const padTop = 14;
  const padBottom = 6;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const x = (i: number) => (n <= 1 ? padX + plotW / 2 : padX + (i / (n - 1)) * plotW);
  const y = (c: number) => padTop + plotH - (c / max) * plotH;
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.count).toFixed(1)}`);
  const line = pts.length ? `M ${pts.join(' L ')}` : '';
  const area = pts.length
    ? `M ${x(0).toFixed(1)},${(padTop + plotH).toFixed(1)} L ${pts.join(' L ')} L ${x(n - 1).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`
    : '';

  return (
    <div className="bpp-card p-5 transition-all duration-200 hover:shadow-elevated">
      <div className="flex items-center justify-between">
        <h2 className="bpp-label-caps">Activity — last 30 days</h2>
        <span className="text-[11px] tabular-nums text-muted-foreground/50">
          {total.toLocaleString()} events · peak {max}
        </span>
      </div>
      {total === 0 ? (
        <ChartEmpty label="No activity in this period" />
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="mt-3 h-40 w-full text-primary"
            role="img"
            aria-label="Activity over the last 30 days"
          >
            <defs>
              <linearGradient id="activity-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#activity-fill)" />
            <path
              d={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/40">
            <span>{fmtDay(data[0]?.date)}</span>
            <span>{fmtDay(data[n - 1]?.date)}</span>
          </div>
        </>
      )}
    </div>
  );
}

/** SVG donut of file counts per type category, with a legend. */
export function FileTypePie({ data }: { data: FileTypeSlice[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const r = 42;
  const C = 2 * Math.PI * r;
  // Precompute each slice's arc length + start offset immutably (no render-time
  // mutation) so the segments lay end-to-end around the donut.
  const dashes = sorted.map((d) => (total > 0 ? (d.count / total) * C : 0));
  const offsets = dashes.map((_, i) => dashes.slice(0, i).reduce((sum, v) => sum + v, 0));

  return (
    <div className="bpp-card p-5 transition-all duration-200 hover:shadow-elevated">
      <h2 className="bpp-label-caps">File types</h2>
      {total === 0 ? (
        <ChartEmpty label="No files yet" />
      ) : (
        <div className="mt-3 flex items-center gap-5">
          <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="14" opacity="0.4" />
            {sorted.map((d, i) => (
              <circle
                key={d.key}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={TYPE_META[d.key]?.color ?? '#94a3b8'}
                strokeWidth="14"
                strokeDasharray={`${dashes[i].toFixed(2)} ${(C - dashes[i]).toFixed(2)}`}
                strokeDashoffset={(-offsets[i]).toFixed(2)}
              />
            ))}
          </svg>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {sorted.map((d) => (
              <li key={d.key} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: TYPE_META[d.key]?.color ?? '#94a3b8' }}
                />
                <span className="flex-1 truncate text-foreground/80">
                  {TYPE_META[d.key]?.label ?? d.key}
                </span>
                <span className="tabular-nums text-muted-foreground/55">{d.count}</span>
                <span className="w-9 text-right tabular-nums text-muted-foreground/40">
                  {Math.round((d.count / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
