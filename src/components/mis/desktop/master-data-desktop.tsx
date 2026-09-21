'use client';

import Link from 'next/link';

import { LIST_PAGE_SIZE, NAV_GROUPS, masterSpec, type DirectoryEntry, type MasterKey, type MasterListView } from '@/lib/mis/master-directory';
import { cn } from '@/lib/utils';

import { useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';
import { MasterEditForm } from './master-edit-form';

/**
 * D10 — "Eleven masters, one component, zero forks."
 *
 * ONE list component behind every master: the sub-nav is the proof (each entry a different title, column set and
 * route), and this file knows nothing about any master beyond `MASTERS`. Three panes — sub-nav, list, edit — and
 * the list stays visible while a row is edited, because the edit panel docks beside it.
 *
 * Left out and said: a Hindi column for machines and raw materials (they have no Hindi name to set — "not set"
 * would be a lie), a machine's Running/Free/Down badge (that is derived from the board, not master data), an
 * "Edited by … on …" line (no editor is recorded on a master row), and Checklists / Pools / Paper types (no such
 * master exists). Nothing here is money: a raw material's price is the Owner's (D24) and is not in this screen.
 */

const href = (master: MasterKey, q: { q?: string; deactivated?: boolean; edit?: string | null; create?: boolean }) => {
  const base = masterSpec(master)!.href;
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  if (q.deactivated) p.set('deactivated', '1');
  if (q.edit) p.set('edit', q.edit);
  if (q.create) p.set('create', '1');
  const s = p.toString();
  return s ? `${base}?${s}` : base;
};

export function MasterDataDesktop({ directory, list, denied = false }: { directory: DirectoryEntry[] | null; list: MasterListView | null; denied?: boolean }) {
  const t = useT();
  if (denied) return <p role="alert" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">{t('d10.noAccess')}</p>;
  if (!directory || !list) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{t('d10.loadFailed')}</p>
        <Link href="/mis/masters?view=classic" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">{t('d10.openClassic')}</Link>
      </div>
    );
  }

  const spec = masterSpec(list.master)!;
  const { counts } = list;
  const keep = { q: list.query || undefined, deactivated: list.showDeactivated };
  const listHref = href(list.master, keep);
  const columnKeys = spec.columns;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
        <span>{t('d10.crumb.settings')}</span>
        <span aria-hidden="true">/</span>
        <span>{t('d10.crumb.masterData')}</span>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-slate-900">{t(`d10.master.${list.master}` as never)}</span>
      </nav>

      <div className={cn('grid gap-5', list.editing ? 'lg:grid-cols-[220px_minmax(0,1fr)_380px]' : 'lg:grid-cols-[220px_minmax(0,1fr)]')}>
        <nav aria-label={t('d10.crumb.masterData')} className="min-w-0">
          {NAV_GROUPS.map((group) => {
            const entries = directory.filter((d) => d.nav === group);
            if (entries.length === 0 && group !== 'PEOPLE') return null;
            return (
              <div key={group} className="mb-4">
                <p className="mb-1 px-3 font-mono text-[10px] uppercase tracking-wider text-slate-500">{t(`d10.nav.${group}` as never)}</p>
                <ul className="flex flex-col gap-0.5">
                  {entries.map((d) => (
                    <li key={d.key}>
                      <Link
                        href={d.href}
                        aria-current={d.key === list.master ? 'page' : undefined}
                        className={cn('flex min-h-11 items-center justify-between rounded-lg px-3 text-sm', d.key === list.master ? 'bg-indigo-50 font-bold text-indigo-900' : 'text-slate-800 hover:bg-slate-100')}
                      >
                        <span>{t(`d10.master.${d.key}` as never)}</span>
                        <span className="font-mono text-xs text-slate-500">{d.counts.total}</span>
                      </Link>
                    </li>
                  ))}
                  {group === 'PEOPLE' ? (
                    <li>
                      <Link href="/mis/attendance/shifts" className="flex min-h-11 items-center rounded-lg px-3 text-sm text-slate-800 hover:bg-slate-100">{t('d10.shifts')}</Link>
                    </li>
                  ) : null}
                </ul>
              </div>
            );
          })}
          <p className="px-3 font-mono text-[11px] text-slate-500">{t('d10.notRecorded')}</p>
        </nav>

        <section className="min-w-0">
          <DesktopPageHeader
            title={t(`d10.master.${list.master}` as never)}
            summary={`${counts.total} ${t('d10.total')} · ${counts.active} ${t('d10.active')} · ${counts.deactivated} ${t('d10.deactivated')}`}
            secondary={
              <>
                <form method="get" action={spec.href} className="flex items-center gap-2">
                  {list.showDeactivated ? <input type="hidden" name="deactivated" value="1" /> : null}
                  <label className="sr-only" htmlFor="d10-search">{t('d10.search')}</label>
                  <input id="d10-search" type="search" name="q" defaultValue={list.query} placeholder={t('d10.searchPlaceholder')} className="min-h-12 w-56 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500" />
                  <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">{t('d10.search')}</button>
                </form>
                <Link
                  href={href(list.master, { q: list.query || undefined, deactivated: !list.showDeactivated })}
                  aria-pressed={list.showDeactivated}
                  className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {list.showDeactivated ? t('d10.hideDeactivated') : `${t('d10.showDeactivated')} (${counts.deactivated})`}
                </Link>
              </>
            }
            primary={
              list.canWrite ? (
                <Link href={href(list.master, { ...keep, create: true })} className="inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">
                  + {t('d10.add')}
                </Link>
              ) : undefined
            }
          />

          {!list.canWrite ? <p className="mb-3 font-mono text-[11px] text-slate-500">{t('d10.readOnly')}</p> : null}

          {list.rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">{list.query ? t('d10.noMatch') : t('d10.empty')}</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
              <table className="w-full border-separate border-spacing-y-1 text-sm" aria-label={t(`d10.master.${list.master}` as never)}>
                <thead>
                  <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                    {spec.fields[0].key === 'code' ? <th scope="col" className="px-3 py-2 font-medium">{t('d10.col.code')}</th> : null}
                    <th scope="col" className="px-3 py-2 font-medium">{t('d10.col.name')}</th>
                    {spec.hasHindi ? <th scope="col" className="px-3 py-2 font-medium">{t('d10.col.nameHi')}</th> : null}
                    {columnKeys.map((c) => <th key={c} scope="col" className="px-3 py-2 font-medium">{t(`d10.col.${c}` as never)}</th>)}
                    <th scope="col" className="px-3 py-2 font-medium">{t('d10.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => {
                    const editing = list.editing?.id === r.id;
                    const to = list.canWrite ? href(list.master, { ...keep, edit: r.id }) : null;
                    const cell = (child: React.ReactNode, cls = '') => <td className={cn('px-3', cls)}>{child}</td>;
                    return (
                      <tr key={r.id} aria-current={editing ? 'true' : undefined} className={cn('rounded-xl', editing ? 'bg-indigo-50 outline outline-2 outline-indigo-300' : 'bg-[#f1ebdf]', r.deactivated && 'opacity-70')}>
                        {spec.fields[0].key === 'code'
                          ? cell(to ? <Link href={to} className="inline-flex min-h-11 items-center font-mono text-xs text-slate-700">{r.code}</Link> : <span className="font-mono text-xs">{r.code}</span>)
                          : null}
                        {cell(
                          to ? <Link href={to} className={cn('inline-flex min-h-11 items-center font-bold text-slate-900', r.deactivated && 'line-through')}>{r.name}</Link> : <span className={cn('font-bold', r.deactivated && 'line-through')}>{r.name}</span>,
                        )}
                        {spec.hasHindi ? cell(r.nameHi ? <span>{r.nameHi}</span> : <span className="italic text-slate-500">{t('d10.notSet')}</span>) : null}
                        {columnKeys.map((c) => <td key={c} className="px-3 text-slate-700">{r.cells[c] ?? '—'}</td>)}
                        {cell(
                          r.deactivated ? (
                            <span className="rounded-full border border-dashed border-slate-400 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{t('d10.statusDeactivated')}</span>
                          ) : (
                            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-800">{t('d10.statusActive')}</span>
                          ),
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 flex flex-wrap justify-between gap-2 px-3 py-2 font-mono text-[11px] text-slate-500">
                <span>
                  {t('d10.showing')} {list.rows.length} {t('d10.of')} {list.matched} · {LIST_PAGE_SIZE} {t('d10.perPage')}
                </span>
                {!list.showDeactivated && counts.deactivated > 0 ? (
                  <Link href={href(list.master, { q: list.query || undefined, deactivated: true })} className="inline-flex min-h-11 items-center font-semibold text-indigo-700">
                    {t('d10.showDeactivated')} ({counts.deactivated})
                  </Link>
                ) : null}
              </p>
            </div>
          )}
        </section>

        {list.editing ? <MasterEditForm key={list.editing.id ?? 'new'} master={list.master} editing={list.editing} options={list.options} closeHref={listHref} error={list.error} /> : null}
      </div>
    </div>
  );
}

