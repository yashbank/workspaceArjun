'use client';

import Link from 'next/link';

import { DOC_PAGE_SIZE, sizeLabel, type DocDetailView, type DocGroup, type DocLibraryView, type DocRowView } from '@/lib/mis/document-library';
import { cn } from '@/lib/utils';

import { useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';
import { DocumentsAddForm } from './documents-add-form';

/**
 * D13 — "Generated or uploaded — the whole screen turns on that difference."
 *
 * **What is drawn is what is recorded.** A document here is a NAME and a LINK to a file, attached to one order,
 * with an optional size and type. There is no generated/uploaded split (a generated document is a print page from an
 * order, never a stored row), no version, no retention rule, no "superseded by", no preview and no upload — so none of
 * those is drawn as a fact. The groups are by file type, which IS recorded. A missing size or type reads "not
 * recorded", never 0 or a guess (F-23).
 *
 * **A link is only followed when it is safe** (`href` is null otherwise, and the link is shown as plain text).
 * **Nothing floats:** every document belongs to an order — said in words, since a count of zero would look measured.
 */

const base = '/mis/documents';

function link(view: Pick<DocLibraryView, 'query' | 'group' | 'page'>, over: { group?: DocGroup; doc?: string | null; page?: number; add?: boolean } = {}) {
  const q = new URLSearchParams();
  const group = over.group ?? view.group;
  const page = over.page ?? (over.group !== undefined ? 1 : view.page);
  if (view.query) q.set('q', view.query);
  if (group !== 'all') q.set('group', group);
  if (page > 1) q.set('page', String(page));
  if (over.doc) q.set('doc', over.doc);
  if (over.add) q.set('add', '1');
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function DocumentsDesktop({ view, denied = false }: { view: DocLibraryView | null; denied?: boolean }) {
  const t = useT();
  if (denied) return <p role="alert" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">{t('d13.noAccess')}</p>;
  if (!view) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{t('d13.loadFailed')}</p>
        <Link href="/mis/documents?view=classic" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">{t('d13.openClassic')}</Link>
      </div>
    );
  }

  const { totals } = view;
  const recorded = sizeLabel(totals.recordedBytes);
  const summary = [
    `${totals.files} ${totals.files === 1 ? t('d13.file') : t('d13.files')}`,
    totals.files === 0 ? null : totals.unsized === totals.files ? t('d13.noSizes') : `${recorded} ${t('d13.recorded')}${totals.unsized > 0 ? ` (${totals.unsized} ${t('d13.withoutSize')})` : ''}`,
    t('d13.everyOne'),
  ].filter(Boolean).join(' · ');

  const groups: { key: DocGroup; label: string; count: number }[] = [
    { key: 'all', label: t('d13.group.all'), count: totals.files },
    { key: 'pdf', label: t('d13.group.pdf'), count: totals.byGroup.pdf },
    { key: 'image', label: t('d13.group.image'), count: totals.byGroup.image },
    { key: 'other', label: t('d13.group.other'), count: totals.byGroup.other },
    { key: 'untyped', label: t('d13.group.untyped'), count: totals.byGroup.untyped },
  ];

  return (
    <div>
      <nav aria-label={t('d13.breadcrumb')} className="mb-3 text-sm font-semibold text-slate-900">{t('d13.title')}</nav>

      <DesktopPageHeader
        title={t('d13.title')}
        summary={summary}
        secondary={
          // A plain GET form: a search is a read. The group is kept; the open file and page are not.
          <form method="get" action={base} role="search" className="flex items-center gap-2">
            {view.group !== 'all' ? <input type="hidden" name="group" value={view.group} /> : null}
            <label className="sr-only" htmlFor="d13-q">{t('d13.searchLabel')}</label>
            <input id="d13-q" type="search" name="q" defaultValue={view.query} placeholder={t('d13.search')} maxLength={60} className="min-h-12 w-72 rounded-lg border border-slate-300 bg-white px-3 text-base" />
            <button type="submit" className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100">{t('d13.searchButton')}</button>
          </form>
        }
        primary={view.canWrite ? <Link href={link(view, { add: true })} className="inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">{t('d13.addTitle')}</Link> : undefined}
      />

      {view.notice === 'added' ? <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{t('d13.added')}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1.3fr)]">
        <nav aria-label={t('d13.groups')} className="flex min-w-0 flex-col gap-1">
          {groups.map((g) => <GroupLink key={g.key} to={link(view, { group: g.key })} active={view.group === g.key} label={g.label} count={g.count} />)}
          <p className="mt-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('d13.filter')}</p>
          <GroupLink to={link(view, { group: 'month' })} active={view.group === 'month'} label={t('d13.group.month')} count={view.monthCount} />
        </nav>

        <section aria-label={t('d13.list')} className="flex min-w-0 flex-col gap-2">
          {view.rows.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6">
              <h2 className="text-base font-semibold text-slate-900">{totals.files === 0 ? t('d13.emptyTitle') : t('d13.noMatch')}</h2>
              <p className="mt-1 text-sm text-slate-600">{totals.files === 0 ? t('d13.emptyBody') : t('d13.noMatchBody')}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {view.rows.map((r) => <DocCard key={r.id} row={r} active={view.selected?.id === r.id && !view.add} to={link(view, { doc: r.id })} />)}
            </ul>
          )}
          <Pager view={view} />
        </section>

        <div className="min-w-0">
          {view.add ? <DocumentsAddForm orders={view.add.orders} closeHref={link(view)} /> : view.selected ? <Detail doc={view.selected} /> : (
            <p className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">{t('d13.pickOne')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function GroupLink({ to, active, label, count }: { to: string; active: boolean; label: string; count: number }) {
  return (
    <Link href={to} aria-current={active ? 'true' : undefined} className={cn('flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm', active ? 'bg-indigo-50 font-bold text-indigo-900' : 'text-slate-700 hover:bg-slate-100')}>
      <span className="truncate">{label}</span>
      <span className="font-mono text-xs text-slate-500">{count}</span>
    </Link>
  );
}

function DocCard({ row, active, to }: { row: DocRowView; active: boolean; to: string }) {
  const t = useT();
  return (
    <li>
      <Link href={to} aria-current={active ? 'true' : undefined} className={cn('flex min-h-14 flex-col gap-1 rounded-xl border bg-white p-3.5', active ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-100')}>
        <span className="truncate text-sm font-bold text-slate-900">{row.name}</span>
        <span className="truncate font-mono text-[11px] text-slate-500">{row.orderNumber} · {row.addedLabel}{row.size ? ` · ${row.size}` : ''}</span>
        <span className="self-start rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">{t(`d13.family.${row.family}` as never)}</span>
      </Link>
    </li>
  );
}

function Pager({ view }: { view: DocLibraryView }) {
  const t = useT();
  const from = view.matching === 0 ? 0 : (view.page - 1) * DOC_PAGE_SIZE + 1;
  const to = Math.min(view.matching, view.page * DOC_PAGE_SIZE);
  return (
    <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500">
      <span className="font-mono">{from}–{to} {t('d13.of')} {view.matching} · {t('d13.newestFirst')}</span>
      <span className="flex gap-2">
        {view.page > 1 ? <Link href={link(view, { page: view.page - 1 })} className="inline-flex min-h-11 items-center px-2 font-semibold text-slate-800 underline">{t('d13.newer')}</Link> : null}
        {view.page < view.pageCount ? <Link href={link(view, { page: view.page + 1 })} className="inline-flex min-h-11 items-center px-2 font-semibold text-slate-800 underline">{t('d13.older')}</Link> : null}
      </span>
    </div>
  );
}

function Detail({ doc }: { doc: DocDetailView }) {
  const t = useT();
  const notRecorded = <span className="text-slate-500">{t('d13.notRecorded')}</span>;
  return (
    <section aria-label={doc.name} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="min-w-0 break-words text-base font-bold text-slate-900">{doc.name}</h2>
        {doc.href ? (
          <a href={doc.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100">{t('d13.open')}</a>
        ) : null}
      </header>

      <div className="flex min-h-40 items-center justify-center border-b border-slate-200 bg-[#f1ebdf] px-6 py-8 text-center text-sm text-slate-600">
        {t('d13.noPreview')}
      </div>

      <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 px-5 py-4 text-sm">
        <dt className="text-slate-500">{t('d13.attachedTo')}</dt>
        <dd className="font-mono font-semibold text-slate-900"><Link href={`/mis/orders/${doc.orderId}`} className="inline-flex min-h-11 items-center underline">{doc.orderNumber}</Link>{doc.orderDescription ? ` · ${doc.orderDescription}` : ''}</dd>
        <dt className="text-slate-500">{t('d13.addedLabel')}</dt>
        <dd className="text-slate-900">{doc.addedFull} · {doc.addedBy ?? <span className="text-slate-500">{t('d13.personNotRecorded')}</span>}</dd>
        <dt className="text-slate-500">{t('d13.type')}</dt>
        <dd className="font-mono text-slate-900">{doc.mimeType?.trim() ? doc.mimeType : notRecorded}</dd>
        <dt className="text-slate-500">{t('d13.size')}</dt>
        <dd className="font-mono text-slate-900">{doc.size ?? notRecorded}</dd>
        <dt className="text-slate-500">{t('d13.retention')}</dt>
        <dd>{notRecorded}</dd>
        <dt className="text-slate-500">{t('d13.superseded')}</dt>
        <dd>{notRecorded}</dd>
        <dt className="text-slate-500">{t('d13.linkLabel')}</dt>
        <dd className="break-all font-mono text-xs text-slate-700">{doc.link}{doc.href ? null : <span className="mt-1 block font-sans text-sm text-red-800">{t('d13.unsafeLink')}</span>}</dd>
        {doc.description ? (<><dt className="text-slate-500">{t('d13.description')}</dt><dd className="text-slate-900">{doc.description}</dd></>) : null}
      </dl>

      <p className="mx-5 mb-5 flex items-start gap-2 rounded-xl border border-slate-200 bg-[#f1ebdf] px-3 py-2.5 text-sm text-slate-700">
        <span aria-hidden="true">ⓘ</span>
        <span>{t('d13.honestNote')}</span>
      </p>
    </section>
  );
}
