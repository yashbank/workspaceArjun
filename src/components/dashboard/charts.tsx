'use client';

import { useState } from 'react';
import type { ActivityDayPoint, FileTypeSlice } from '@/server/dashboard/load-dashboard-data';

// Vivid, distinct palette per file type — bright for light mode, holds up in dark.
const TYPE_META: Record<string, { label: string; color: string }> = {
  image: { label: 'Images', color: '#0ea5e9' },
  pdf: { label: 'PDFs', color: '#f43f5e' },
  video: { label: 'Videos', color: '#ec4899' },
  design: { label: 'Design', color: '#a855f7' },
  archive: { label: 'Archives', color: '#f59e0b' },
  document: { label: 'Documents', color: '#3b82f6' },
  other: { label: 'Other', color: '#14b8a6' },
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

/**
 * Premium activity graph: gradient area + glowing line that animates in, soft
 * gridlines, and an interactive hover crosshair/tooltip. Renders the last 30
 * days of the supplied series.
 */
export function ActivityAreaChart({ data }: { data: ActivityDayPoint[] }) {
  const series = data.slice(-30);
  const [hover, setHover] = useState<number | null>(null);

  const W = 600;
  const H = 170;
  const padX = 10;
  const padTop = 18;
  const padBottom = 10;
  const plotW = W - padX * 2;
  const plotH = H - padTop - padBottom;
  const n = series.length;
  const max = Math.max(1, ...series.map((d) => d.count));
  const total = series.reduce((s, d) => s + d.count, 0);
  const peak = Math.max(0, ...series.map((d) => d.count));

  const x = (i: number) => (n <= 1 ? padX + plotW / 2 : padX + (i / (n - 1)) * plotW);
  const y = (c: number) => padTop + plotH - (c / max) * plotH;
  const pts = series.map((d, i) => `${x(i).toFixed(1)},${y(d.count).toFixed(1)}`);
  const line = pts.length ? `M ${pts.join(' L ')}` : '';
  const area = pts.length
    ? `M ${x(0).toFixed(1)},${(padTop + plotH).toFixed(1)} L ${pts.join(' L ')} L ${x(n - 1).toFixed(1)},${(padTop + plotH).toFixed(1)} Z`
    : '';

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || n === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  }

  const hoverPoint = hover != null ? series[hover] : null;

  return (
    <div className="bpp-card relative p-5 transition-all duration-200 hover:shadow-elevated">
      <div className="flex items-center justify-between">
        <h2 className="bpp-label-caps">Activity — last 30 days</h2>
        <span className="text-[11px] tabular-nums text-muted-foreground/50">
          {total.toLocaleString()} events · peak {peak}
        </span>
      </div>
      {total === 0 ? (
        <ChartEmpty label="No activity in this period" />
      ) : (
        <>
          <div className="relative mt-3">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="h-44 w-full"
              role="img"
              aria-label="Activity over the last 30 days"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id="act-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="act-stroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="55%" stopColor="#8b5cf6" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
                <filter id="act-glow" x="-10%" y="-30%" width="120%" height="160%">
                  <feGaussianBlur stdDeviation="3" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* gridlines */}
              {[0.25, 0.5, 0.75, 1].map((g) => (
                <line
                  key={g}
                  x1={padX}
                  x2={W - padX}
                  y1={padTop + plotH - g * plotH}
                  y2={padTop + plotH - g * plotH}
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-border/40"
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              <path d={area} fill="url(#act-area)" className="animate-in fade-in duration-700" />
              <path
                d={line}
                fill="none"
                stroke="url(#act-stroke)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                filter="url(#act-glow)"
                pathLength={1}
                style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: 'draw 1.1s ease-out forwards' }}
              />

              {hover != null && hoverPoint && (
                <>
                  <line
                    x1={x(hover)}
                    x2={x(hover)}
                    y1={padTop}
                    y2={padTop + plotH}
                    stroke="#8b5cf6"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle cx={x(hover)} cy={y(hoverPoint.count)} r="4" fill="#8b5cf6" vectorEffect="non-scaling-stroke" />
                </>
              )}
            </svg>

            {hover != null && hoverPoint && (
              <div
                className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-lg border border-border/50 bg-popover px-2.5 py-1 text-[11px] shadow-float"
                style={{ left: `${n <= 1 ? 50 : (hover / (n - 1)) * 100}%` }}
              >
                <span className="font-semibold tabular-nums">{hoverPoint.count}</span>
                <span className="text-muted-foreground/60"> · {fmtDay(hoverPoint.date)}</span>
              </div>
            )}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground/40">
            <span>{fmtDay(series[0]?.date)}</span>
            <span>{fmtDay(series[n - 1]?.date)}</span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Glossy donut of file counts per type. Per-slice gloss + a soft drop shadow
 * give a premium 2.5D feel; hovering a slice (or legend row) lifts it, dims the
 * rest, and shows that slice in the center. Animates in.
 */
export function FileTypePie({ data }: { data: FileTypeSlice[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const [hover, setHover] = useState<string | null>(null);
  const r = 42;
  const C = 2 * Math.PI * r;
  const dashes = sorted.map((d) => (total > 0 ? (d.count / total) * C : 0));
  const offsets = dashes.map((_, i) => dashes.slice(0, i).reduce((sum, v) => sum + v, 0));

  const active = hover ? sorted.find((d) => d.key === hover) : null;
  const centerValue = active ? active.count : total;
  const centerLabel = active ? (TYPE_META[active.key]?.label ?? active.key) : 'files';

  return (
    <div className="bpp-card p-5 transition-all duration-200 hover:shadow-elevated">
      <h2 className="bpp-label-caps">File types</h2>
      {total === 0 ? (
        <ChartEmpty label="No files yet" />
      ) : (
        <div className="mt-3 flex items-center gap-5">
          <div className="relative h-32 w-32 shrink-0">
            <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90 animate-in zoom-in-95 fade-in duration-500">
              <defs>
                <radialGradient id="pie-gloss" cx="38%" cy="32%" r="72%">
                  <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
                  <stop offset="42%" stopColor="#ffffff" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                </radialGradient>
                <filter id="pie-shadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="1.4" stdDeviation="1.6" floodColor="#000" floodOpacity="0.22" />
                </filter>
              </defs>
              <g filter="url(#pie-shadow)">
                <circle cx="50" cy="50" r={r} fill="none" stroke="var(--muted)" strokeWidth="15" opacity="0.4" />
                {sorted.map((d, i) => {
                  const dim = hover && hover !== d.key;
                  return (
                    <circle
                      key={d.key}
                      cx="50"
                      cy="50"
                      r={r}
                      fill="none"
                      stroke={TYPE_META[d.key]?.color ?? '#94a3b8'}
                      strokeWidth={hover === d.key ? 19 : 15}
                      strokeDasharray={`${dashes[i].toFixed(2)} ${(C - dashes[i]).toFixed(2)}`}
                      strokeDashoffset={(-offsets[i]).toFixed(2)}
                      strokeLinecap="butt"
                      opacity={dim ? 0.35 : 1}
                      className="cursor-pointer transition-all duration-200"
                      onMouseEnter={() => setHover(d.key)}
                      onMouseLeave={() => setHover(null)}
                    />
                  );
                })}
              </g>
              {/* gloss highlight (not rotated-sensitive) */}
              <circle cx="50" cy="50" r={r + 7.5} fill="url(#pie-gloss)" className="pointer-events-none" />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold tabular-nums tracking-tight">{centerValue}</span>
              <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/55">
                {centerLabel}
              </span>
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-1.5">
            {sorted.map((d) => (
              <li
                key={d.key}
                onMouseEnter={() => setHover(d.key)}
                onMouseLeave={() => setHover(null)}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5 text-xs transition-colors ${
                  hover === d.key ? 'bg-accent/40' : ''
                }`}
              >
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

const HEAT_SHADES = [
  'rgba(99,102,241,0.10)',
  'rgba(99,102,241,0.30)',
  'rgba(99,102,241,0.52)',
  'rgba(99,102,241,0.74)',
  'rgba(99,102,241,1)',
];

function heatLevel(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

/**
 * GitHub-style date-wise activity heatmap (last 13 weeks). Columns are weeks,
 * rows are weekdays; cell intensity reflects event volume. Hover shows the day.
 */
export function ActivityHeatmap({ data }: { data: ActivityDayPoint[] }) {
  const [hover, setHover] = useState<ActivityDayPoint | null>(null);
  if (data.length === 0) {
    return (
      <div className="bpp-card p-5">
        <h2 className="bpp-label-caps">Work locator — last 13 weeks</h2>
        <ChartEmpty label="No activity yet" />
      </div>
    );
  }

  // Pad to whole weeks (leading by the first day's weekday) and chunk into columns.
  const firstWeekday = new Date(`${data[0].date}T00:00:00Z`).getUTCDay();
  const cells: (ActivityDayPoint | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (const d of data) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (ActivityDayPoint | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div className="bpp-card p-5 transition-all duration-200 hover:shadow-elevated">
      <div className="flex items-center justify-between">
        <h2 className="bpp-label-caps">Work locator — last 13 weeks</h2>
        <span className="text-[11px] tabular-nums text-muted-foreground/50">
          {hover ? `${hover.count} on ${fmtDay(hover.date)}` : `${total.toLocaleString()} events`}
        </span>
      </div>

      <div className="mt-3 overflow-x-auto pb-1">
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((cell, di) =>
                cell ? (
                  <div
                    key={di}
                    onMouseEnter={() => setHover(cell)}
                    onMouseLeave={() => setHover(null)}
                    title={`${fmtDay(cell.date)}: ${cell.count} event${cell.count === 1 ? '' : 's'}`}
                    className="h-3.5 w-3.5 rounded-[3px] ring-1 ring-inset ring-black/5 transition-transform duration-150 hover:scale-125 dark:ring-white/5"
                    style={{ backgroundColor: HEAT_SHADES[heatLevel(cell.count)] }}
                  />
                ) : (
                  <div key={di} className="h-3.5 w-3.5" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground/45">
        <span>Less</span>
        {HEAT_SHADES.map((c, i) => (
          <span key={i} className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: c }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
