'use client';

import { useMemo, useState, useTransition } from 'react';

import { GRID_SLOTS, flowLayout, widgetByKey, type PlacedWidget, type WidgetGroupListing } from '@/lib/mis/widgets';
import type { MisRoleName } from '@/lib/mis/roles';
import { cn } from '@/lib/utils';

import { useT } from '../shell/locale-provider';
import { WidgetBody, type DashboardData } from './widgets';

/**
 * The dashboard, in its two modes (D1 viewing, D2 customising).
 *
 * The layout is an ORDER of widget keys; the grid is derived from it by `flowLayout`. That
 * is what D2 means by "nothing overlaps, nothing needs collision code": moving a widget is
 * moving it in a list, and the columns re-flow. The same order renders at any width, which
 * is also how one component serves both layouts — four columns from 1024px up, one column
 * below, no second markup and no third layout.
 *
 * The browser only ever sends the ORDER to the server. Geometry is recomputed there, so a
 * posted x/y/w/h cannot overlap widgets or resize one past what the library allows — and the
 * role check refuses a widget this person may not hold (D24).
 */

export type DashboardScreenProps = {
  role: MisRoleName | null;
  initialLayout: PlacedWidget[];
  catalogue: WidgetGroupListing[];
  data: DashboardData;
  onSave: (widgetKeys: string[]) => Promise<{ ok: boolean; detail?: string }>;
  onReset: () => Promise<{ ok: boolean; detail?: string }>;
  /** "Good morning / Monday, 7 September · 07:12" (D1) — optional so a test can render the
   *  screen without it and every OTHER desktop page (which has no greeting) is unaffected. */
  header?: { title: string; meta: string };
};

export function DashboardScreen({ role, initialLayout, catalogue, data, onSave, onReset, header }: DashboardScreenProps) {
  const t = useT();
  const [customising, setCustomising] = useState(false);
  const [order, setOrder] = useState<string[]>(() => initialLayout.map((p) => p.widgetKey));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const layout = useMemo(() => flowLayout(order, role), [order, role]);
  const placed = useMemo(() => new Set(order), [order]);
  const slotsUsed = layout.reduce((sum, p) => sum + p.w * p.h, 0);

  const move = (key: string, delta: number) => {
    setOrder((current) => {
      const from = current.indexOf(key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
  };

  const add = (key: string) => setOrder((current) => (current.includes(key) ? current : [...current, key]));
  const remove = (key: string) => setOrder((current) => current.filter((k) => k !== key));

  const done = () => {
    setError(null);
    startTransition(async () => {
      const result = await onSave(order);
      if (result.ok) setCustomising(false);
      else setError(result.detail ?? t('desk.saveFailed'));
    });
  };

  const reset = () => {
    setError(null);
    startTransition(async () => {
      const result = await onReset();
      if (!result.ok) setError(result.detail ?? t('desk.saveFailed'));
      else window.location.reload();
    });
  };

  return (
    <div>
      {/* 24G-part1 gap 5 — D1's own top bar carries this greeting; the shared DesktopShell
          chrome (every OTHER desktop screen) only has the search box, so this lives in the
          dashboard's own content rather than being forced onto screens that never asked for
          it. */}
      {header && (
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900">{header.title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{header.meta}</p>
        </div>
      )}

      {/* D2: "Customising is a mode, and it looks like one." The whole bar turns indigo and
          says what is happening, so nobody rearranges their dashboard by accident. */}
      {customising ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-indigo-600 px-4 py-3 text-white">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t('desk.customising')}</p>
            <p className="truncate text-xs text-indigo-100">{t('desk.customising.how')}</p>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={pending}
            className="min-h-11 rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {t('desk.resetDefault')}
          </button>
          <button
            type="button"
            onClick={done}
            disabled={pending}
            className="min-h-11 rounded-lg bg-white px-5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
          >
            {t('desk.done')}
          </button>
        </div>
      ) : (
        <div className="mb-4 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setCustomising(true)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            {t('desk.customise')}
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className={cn('gap-4', customising ? 'lg:grid lg:grid-cols-[1fr_320px]' : '')}>
        <div>
          {customising ? (
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-slate-500">
              {t('desk.yourLayout')} · {slotsUsed} {t('desk.slotsUsed')}
            </p>
          ) : null}

          {layout.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
              {t('desk.noWidgets')}
            </p>
          ) : (
            // One column below 1024px, four from there up. The SAME order, re-flowed —
            // this is the whole "same widgets, one column" half of the two-layout rule.
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              {layout.map((p, index) => (
                <WidgetCard
                  key={p.widgetKey}
                  placed={p}
                  data={data}
                  customising={customising}
                  first={index === 0}
                  last={index === layout.length - 1}
                  onMove={move}
                  onRemove={remove}
                />
              ))}
            </div>
          )}
        </div>

        {customising ? (
          <WidgetLibrary catalogue={catalogue} placedKeys={placed} onAdd={add} />
        ) : null}
      </div>
    </div>
  );
}

function WidgetCard({
  placed,
  data,
  customising,
  first,
  last,
  onMove,
  onRemove,
}: {
  placed: PlacedWidget;
  data: DashboardData;
  customising: boolean;
  first: boolean;
  last: boolean;
  onMove: (key: string, delta: number) => void;
  onRemove: (key: string) => void;
}) {
  const t = useT();
  const widget = widgetByKey(placed.widgetKey);
  if (!widget) return null;

  const money = widget.group === 'MONEY';
  const span = ['', 'lg:col-span-1', 'lg:col-span-2', 'lg:col-span-3', 'lg:col-span-4'][placed.w] ?? 'lg:col-span-1';
  const rows = ['', 'lg:row-span-1', 'lg:row-span-2', 'lg:row-span-3'][placed.h] ?? 'lg:row-span-1';

  return (
    <section
      aria-label={t(widget.titleKey)}
      className={cn(
        'flex min-h-[132px] flex-col rounded-2xl border p-4',
        span,
        rows,
        money ? 'border-slate-800 bg-[#171310] text-white' : 'border-slate-200 bg-white',
      )}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <h2 className={cn('text-sm font-semibold', money ? 'text-white' : 'text-slate-900')}>{t(widget.titleKey)}</h2>
        {customising ? (
          <span className="flex shrink-0 items-center gap-1">
            <span className="mr-1 font-mono text-[10px] text-slate-400">
              {placed.w} × {placed.h}
            </span>
            {/* Drag is the mouse path; these are the keyboard one. A dashboard that can
                only be rearranged by dragging cannot be rearranged by everyone. */}
            <IconButton label={`${t('desk.moveBack')}: ${t(widget.titleKey)}`} disabled={first} onClick={() => onMove(placed.widgetKey, -1)}>
              ←
            </IconButton>
            <IconButton label={`${t('desk.moveForward')}: ${t(widget.titleKey)}`} disabled={last} onClick={() => onMove(placed.widgetKey, 1)}>
              →
            </IconButton>
            <IconButton label={`${t('desk.remove')}: ${t(widget.titleKey)}`} onClick={() => onRemove(placed.widgetKey)}>
              ×
            </IconButton>
          </span>
        ) : null}
      </header>
      <div className="min-h-0 flex-1">
        <WidgetBody widgetKey={placed.widgetKey} data={data} />
      </div>
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      // 24G-part1 gap 6 — 28px (size-7) on every width failed the 44px tap-target rule. This
      // widget grid also renders on the phone frame (below 1024px the two-layout-one-tree
      // shell puts the SAME dashboard content into the mobile column, D1's own note), so the
      // rule does not get to relax just because the control looks "desktop". `lg:` keeps the
      // laptop rail at its original density — D3: "the floor density rule does not relax on a
      // laptop" is about the OTHER direction, never shrinking a phone target to match a laptop.
      className="flex size-11 items-center justify-center rounded-md border border-slate-300 bg-white text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 lg:size-7"
    >
      {children}
    </button>
  );
}

/**
 * The library panel (D2).
 *
 * What is in it was decided on the SERVER: a Supervisor's `catalogue` simply has no money
 * group, so this component has nothing to hide and no role check of its own to get wrong.
 */
function WidgetLibrary({
  catalogue,
  placedKeys,
  onAdd,
}: {
  catalogue: WidgetGroupListing[];
  placedKeys: Set<string>;
  onAdd: (key: string) => void;
}) {
  const t = useT();
  const available = catalogue.reduce((sum, group) => sum + group.widgets.length, 0);

  return (
    <aside aria-label={t('desk.library')} className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 lg:mt-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{t('desk.library')}</h2>
        <span className="font-mono text-[11px] text-slate-500">
          {available} {t('desk.available')}
        </span>
      </div>

      {catalogue.map((group) => (
        <div key={group.group} className="mb-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t(`group.${group.group}` as never)}</p>
          <ul className="flex flex-col gap-1.5">
            {group.widgets.map((widget) => {
              const already = placedKeys.has(widget.key);
              return (
                <li
                  key={widget.key}
                  className={cn(
                    'flex items-start gap-2 rounded-xl border p-2.5',
                    widget.group === 'MONEY' ? 'border-slate-800 bg-[#171310]' : 'border-slate-200 bg-white',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm font-medium', widget.group === 'MONEY' ? 'text-white' : 'text-slate-900')}>
                      {t(widget.titleKey)}
                    </span>
                    <span className={cn('block text-xs', widget.group === 'MONEY' ? 'text-slate-400' : 'text-slate-500')}>
                      {t(widget.descriptionKey)}
                    </span>
                    <span className="mt-1 block font-mono text-[10px] uppercase tracking-wider text-slate-400">
                      {widget.w} × {widget.h} · {widget.group === 'MONEY' ? t('desk.ownerOnly') : t('desk.allRoles')}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onAdd(widget.key)}
                    disabled={already}
                    aria-label={already ? `${t('desk.placed')}: ${t(widget.titleKey)}` : `${t('desk.add')}: ${t(widget.titleKey)}`}
                    title={already ? t('desk.placed') : t('desk.add')}
                    className={cn(
                      // 24G-part1 gap 6 — same reasoning as IconButton above: 32px (size-8)
                      // everywhere failed 44px on the phone width this panel also renders at.
                      'flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold lg:size-8',
                      already ? 'bg-green-100 text-green-700' : 'bg-indigo-600 text-white hover:bg-indigo-700',
                    )}
                  >
                    {already ? '✓' : '+'}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">{t('desk.serverFiltered')}</p>
      <p className="mt-2 font-mono text-[10px] text-slate-400">{GRID_SLOTS} slots</p>
    </aside>
  );
}
