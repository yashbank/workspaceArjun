'use client';

import Link from 'next/link';

import { qtyLabel, type Section, type TraceEvent, type TraceView } from '@/lib/mis/trace';
import { cn } from '@/lib/utils';

import { useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';

/**
 * D11 — "A supplier recalls a lot on Friday. This is the Monday morning answer."
 *
 * Read-only by construction: nothing here submits anything but a search, and the log is a list.
 *
 * **A gap is drawn as a gap.** All six steps are always drawn. A step with nothing recorded is DASHED (an absence
 * of data, MIS_UI_SPEC §4.4 rule 6), and a step this role may not read says so — omitting a step would let a reader
 * assume the chain simply ended, which is exactly the wrong conclusion to reach silently.
 *
 * **No verdict.** The artboard's green "Contained" needs a despatch record and lot-level issue records; neither is
 * recorded, so this screen lists what exists, marks each gap, and says what it cannot tell you (F-21). The "Kg add up"
 * total, "Trace forward" and "Export chain" are left out for the same reason.
 */

const card = 'flex min-w-0 flex-col gap-1.5 rounded-xl border p-3.5 text-sm';

export function TraceabilityDesktop({ view, denied = false }: { view: TraceView | null; denied?: boolean }) {
  const t = useT();
  if (denied) return <p role="alert" className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">{t('d11.noAccess')}</p>;
  if (!view) {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p>{t('d11.loadFailed')}</p>
        <Link href="/mis/traceability?view=classic" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">{t('d11.openClassic')}</Link>
      </div>
    );
  }

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
        <span>{t('d11.crumb.quality')}</span>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-slate-900">{t('d11.crumb.trace')}</span>
      </nav>

      <DesktopPageHeader
        title={t('d11.title')}
        secondary={
          // A plain GET form: a search is the only thing this screen submits.
          <form method="get" action="/mis/traceability" role="search" className="flex items-center gap-2">
            <label className="sr-only" htmlFor="d11-q">{t('d11.searchLabel')}</label>
            <input id="d11-q" type="search" name="q" defaultValue={view.query} placeholder={t('d11.search')} maxLength={60} className="min-h-12 w-80 rounded-lg border border-slate-300 bg-white px-3 font-mono text-base" />
            <button type="submit" className="min-h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700">{t('d11.trace')}</button>
          </form>
        }
      />

      {view.mode === 'idle' ? (
        <Info title={t('d11.idleTitle')} body={t('d11.idleBody')} />
      ) : view.mode === 'none' ? (
        <>
          <Info tone="dashed" title={`${t('d11.noMatch')}: ${view.query}`} body={view.lotDenied ? t('d11.lotDenied') : t('d11.noMatchBody')} />
        </>
      ) : view.mode === 'order' ? (
        <OrderChain view={view} />
      ) : (
        <LotChain view={view} />
      )}

      {view.mode === 'order' || view.mode === 'lot' ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {view.mode === 'order' ? <OrderTables view={view} /> : <LotTables view={view} />}
          <EventLog events={view.events} />
        </div>
      ) : null}
    </div>
  );
}

function Info({ title, body, tone }: { title: string; body: string; tone?: 'dashed' }) {
  return (
    <section className={cn('rounded-2xl bg-white p-6', tone === 'dashed' ? 'border-2 border-dashed border-slate-300' : 'border border-slate-200')}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">{body}</p>
    </section>
  );
}

function OrderChain({ view }: { view: TraceView }) {
  const t = useT();
  const o = view.order!;
  const failures = view.qc.state === 'ok' ? view.qc.data.fail : 0;
  const openFailures = view.qc.state === 'ok' ? view.qc.data.failures.filter((f) => !f.cleared).length : 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t('d11.chainFor')} <span className="font-mono">{o.orderNumber}</span></h2>
        <span className="text-xs text-slate-500">{t('d11.readOnly')}</span>
      </header>

      <ol className="grid gap-3 lg:grid-cols-6">
        <Step n={1} title={t('d11.step.material')} section={view.material} emptyText={t('d11.noReceipt')}>
          {(items) => (
            <>
              <ul className="flex flex-col gap-1">
                {items.map((i, idx) => (
                  <li key={`${idx}-${i.name}`} className="text-xs text-slate-700">
                    <span className="font-semibold">{i.name}</span>{' '}
                    {i.receipts[0] ? (
                      <span>
                        · {i.receipts[0].batchNo ?? '—'} · {qtyLabel(i.receipts[0].qty)} {i.receipts[0].unit} · {i.receipts[0].receivedLabel} · <Person name={i.receipts[0].by} />
                      </span>
                    ) : (
                      <span className="italic text-slate-500">· {t('d11.noReceiptForItem')}</span>
                    )}
                  </li>
                ))}
              </ul>
              <Foot>{t('d11.itemLevel')}</Foot>
            </>
          )}
        </Step>

        <Step n={2} title={t('d11.step.issued')} section={view.issues} emptyText={t('d11.noIssue')}>
          {(lines) => (
            <>
              <ul className="flex flex-col gap-1">
                {lines.map((l, i) => (
                  <li key={i} className="text-xs text-slate-700">
                    <span className="font-mono font-semibold">{qtyLabel(l.qty)} {l.unit}</span> {l.itemName} · {l.atLabel} · <Person name={l.by} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Step>

        <li className={cn(card, 'border-slate-200 bg-[#f1ebdf]')}>
          <StepHead n={3} title={t('d11.step.order')} />
          <p className="font-mono text-base font-bold text-slate-900">{o.orderNumber}</p>
          <p className="text-xs text-slate-700">{o.description ?? '—'}</p>
          <p className="text-xs text-slate-700">{t('d11.customer')}: {o.customer ?? '—'}</p>
          <p className="text-xs text-slate-700">{t('d11.status')}: {o.status}</p>
          <Foot>{t('d11.raised')} {o.raisedLabel}{o.raisedBy ? ` · ${o.raisedBy}` : ''}{o.deliveryLabel ? ` · ${t('d11.delivery')} ${o.deliveryLabel}` : ''}</Foot>
        </li>

        <Step n={4} title={t('d11.step.phases')} section={view.phases} emptyText={t('d11.noPhases')}>
          {(p) => (
            <>
              <p className="font-mono text-base font-bold text-slate-900">{p.done} {t('d11.phaseOf')} {p.total}</p>
              <ul className="flex flex-col gap-0.5">
                {p.rows.map((r) => (
                  <li key={`${r.seq}-${r.name}`} className="text-xs text-slate-700">
                    {String(r.seq).padStart(2, '0')} {r.name} · {t(`d11.ps.${r.status}` as never)}
                    {r.signedLabel ? <> · {r.signedLabel} · <Person name={r.signedBy} /></> : r.startedLabel ? <> · {r.startedLabel} · <Person name={r.startedBy} /></> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Step>

        <Step n={5} title={t('d11.step.qc')} section={view.qc} emptyText={t('d11.nothing')} bad={openFailures > 0}>
          {(q) => (
            <>
              <p className="font-mono text-base font-bold text-slate-900">{failures === 0 ? t('d11.noFailure') : `${failures} ${failures === 1 ? t('d11.failure') : t('d11.failures')}`}</p>
              <ul className="flex flex-col gap-1">
                {q.failures.map((f) => (
                  <li key={f.id} className="text-xs text-slate-700">
                    {f.parameter} · {f.atLabel}{f.defectType ? ` · ${f.defectType}` : ''} · <Person name={f.by} /> ·{' '}
                    <strong className={f.cleared ? 'text-green-800' : 'text-red-800'}>{f.cleared ? `${t('d11.cleared')} ${f.cleared}` : t('d11.notCleared')}</strong>
                  </li>
                ))}
              </ul>
              <Foot>{q.taken} {t('d11.checksTaken')}</Foot>
            </>
          )}
        </Step>

        <li className={cn(card, 'border-2 border-dashed border-slate-300 bg-white')}>
          <StepHead n={6} title={t('d11.step.despatch')} muted />
          <p className="font-mono text-base font-bold text-slate-600">{t('d11.despatchGap')}</p>
          <p className="text-xs text-slate-600">{t('d11.despatchBody')}</p>
          <Foot>{t('d11.despatchStatus')}: {view.despatch.status}</Foot>
        </li>
      </ol>

      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>{t('d11.honestTitle')}.</strong> {t('d11.honestBody')}
      </p>
    </section>
  );
}

function Step<T>({ n, title, section, emptyText, bad, children }: { n: number; title: string; section: Section<T>; emptyText: string; bad?: boolean; children: (data: T) => React.ReactNode }) {
  const t = useT();
  if (section.state === 'ok') {
    return (
      <li className={cn(card, bad ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-[#f1ebdf]')}>
        <StepHead n={n} title={title} bad={bad} />
        {children(section.data)}
      </li>
    );
  }
  return (
    <li className={cn(card, 'border-2 border-dashed border-slate-300 bg-white')}>
      <StepHead n={n} title={title} muted />
      <p className="text-xs text-slate-600">{section.state === 'denied' ? t('d11.hidden') : emptyText}</p>
    </li>
  );
}

function StepHead({ n, title, muted, bad }: { n: number; title: string; muted?: boolean; bad?: boolean }) {
  return (
    <h3 className="flex items-center gap-2">
      <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md font-mono text-xs font-bold', bad ? 'bg-red-600 text-white' : muted ? 'bg-[#f1ebdf] text-slate-500' : 'bg-[#171310] text-white')}>{n}</span>
      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{title}</span>
    </h3>
  );
}

/** A person's name, or — in italics — that the person is not recorded. Never a blank, never someone else. */
function Person({ name }: { name: string | null }) {
  const t = useT();
  return name ? <span className="font-medium">{name}</span> : <span className="italic text-slate-500">{t('d11.unknownPerson')}</span>;
}

function Foot({ children }: { children: React.ReactNode }) {
  return <p className="mt-auto pt-1 text-[11px] text-slate-500">{children}</p>;
}

function OrderTables({ view }: { view: TraceView }) {
  const t = useT();
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-base font-semibold text-slate-900">{t('d11.materialsTitle')}</h2>
      {view.material.state === 'denied' ? (
        <p className="text-sm text-slate-500">{t('d11.hidden')}</p>
      ) : view.material.state === 'none' ? (
        <p className="text-sm text-slate-500">{t('d11.noReceipt')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label={t('d11.materialsTitle')}>
            <caption className="sr-only">{t('d11.materialsTitle')}</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                <th scope="col" className="py-2 font-medium">{t('d11.item')}</th>
                <th scope="col" className="py-2 font-medium">{t('d11.grn')}</th>
                <th scope="col" className="py-2 font-medium">{t('d11.batch')}</th>
                <th scope="col" className="py-2 text-right font-medium">{t('d11.qty')}</th>
                <th scope="col" className="py-2 pl-3 font-medium">{t('d11.when')}</th>
                <th scope="col" className="py-2 font-medium">{t('d11.person')}</th>
              </tr>
            </thead>
            <tbody>
              {view.material.data.flatMap((i, idx) =>
                i.receipts.length === 0
                  ? [<tr key={`${idx}-${i.name}`} className="border-b border-slate-100"><th scope="row" className="py-2 text-left font-normal">{i.name}</th><td colSpan={5} className="py-2 italic text-slate-500">{t('d11.noReceiptForItem')}</td></tr>]
                  : i.receipts.map((r, k) => (
                      <tr key={`${idx}-${i.name}-${k}-${r.grnNumber}`} className="border-b border-slate-100">
                        <th scope="row" className="py-2 text-left font-normal">{i.name}</th>
                        <td className="py-2 font-mono text-xs">{r.grnNumber}</td>
                        <td className="py-2 font-mono text-xs">{r.batchNo ?? '—'}</td>
                        <td className="py-2 text-right font-mono">{qtyLabel(r.qty)} {r.unit}</td>
                        <td className="py-2 pl-3 font-mono text-xs">{r.receivedLabel}</td>
                        <td className="py-2">{r.by ?? <span className="italic text-slate-500">{t('d11.unknownPerson')}</span>}</td>
                      </tr>
                    )),
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 font-mono text-[11px] text-slate-500">{t('d11.itemLevel')}</p>
    </section>
  );
}

function LotChain({ view }: { view: TraceView }) {
  const t = useT();
  const lot = view.lot!;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t('d11.lotFor')} <span className="font-mono">{lot.batchNo}</span></h2>
        <span className="text-xs text-slate-500">{t('d11.readOnly')}</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" aria-label={t('d11.lotReceiptsTitle')}>
          <caption className="sr-only">{t('d11.lotReceiptsTitle')}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <th scope="col" className="py-2 font-medium">{t('d11.grn')}</th>
              <th scope="col" className="py-2 font-medium">{t('d11.po')}</th>
              <th scope="col" className="py-2 font-medium">{t('d11.supplier')}</th>
              <th scope="col" className="py-2 font-medium">{t('d11.item')}</th>
              <th scope="col" className="py-2 text-right font-medium">{t('d11.qty')}</th>
              <th scope="col" className="py-2 pl-3 font-medium">{t('d11.when')}</th>
              <th scope="col" className="py-2 font-medium">{t('d11.person')}</th>
            </tr>
          </thead>
          <tbody>
            {lot.receipts.map((r, k) => (
              <tr key={`${k}-${r.grnNumber}`} className="border-b border-slate-100">
                <th scope="row" className="py-2 text-left font-mono text-xs font-normal">{r.grnNumber}</th>
                <td className="py-2 font-mono text-xs">{r.poNumber ?? '—'}</td>
                <td className="py-2">{r.supplier ?? '—'}</td>
                <td className="py-2">{r.itemName}</td>
                <td className="py-2 text-right font-mono">{qtyLabel(r.qty)} {r.unit}</td>
                <td className="py-2 pl-3 font-mono text-xs">{r.receivedLabel ?? '—'}</td>
                <td className="py-2">{r.by ?? <span className="italic text-slate-500">{t('d11.unknownPerson')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>{t('d11.honestTitle')}.</strong> {t('d11.honestBody')}
      </p>
    </section>
  );
}

function LotTables({ view }: { view: TraceView }) {
  const t = useT();
  const after = view.lot!.issuedAfter;
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 text-base font-semibold text-slate-900">{t('d11.issuedAfterTitle')}</h2>
      <p className="mb-3 font-mono text-[11px] text-slate-500">{t('d11.issuedAfterNote')}</p>
      {after.state === 'denied' ? (
        <p className="text-sm text-slate-500">{t('d11.hidden')}</p>
      ) : after.state === 'none' ? (
        <p className="text-sm text-slate-500">{t('d11.noIssuedAfter')}</p>
      ) : (
        after.data.map((g, gi) => (
          <table key={`${gi}-${g.itemName}`} className="mb-3 w-full border-collapse text-sm" aria-label={`${t('d11.issuedAfterTitle')}: ${g.itemName}`}>
            <caption className="sr-only">{t('d11.issuedAfterTitle')}: {g.itemName}</caption>
            <thead>
              <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                <th scope="col" className="py-2 font-medium">{t('d11.orderCol')}</th>
                <th scope="col" className="py-2 text-right font-medium">{t('d11.qty')} · {g.itemName}</th>
                <th scope="col" className="py-2 pl-3 font-medium">{t('d11.when')}</th>
              </tr>
            </thead>
            <tbody>
              {g.orders.map((o, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <th scope="row" className="py-2 text-left font-mono text-xs font-normal">
                    {o.orderId ? <Link href={`/mis/traceability?q=${encodeURIComponent(o.orderNumber)}`} className="inline-flex min-h-11 items-center text-indigo-700 hover:underline">{o.orderNumber}</Link> : <span className="italic text-slate-500">{t('d11.issuedNoOrder')}</span>}
                  </th>
                  <td className="py-2 text-right font-mono">{qtyLabel(o.qty)} {g.unit}</td>
                  <td className="py-2 pl-3 font-mono text-xs">{o.atLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))
      )}
    </section>
  );
}

function EventLog({ events }: { events: TraceEvent[] }) {
  const t = useT();
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t('d11.eventLog')}</h2>
        <span className="text-xs text-slate-500">{events.length} {t('d11.eventsWord')}</span>
      </header>
      {events.length === 0 ? (
        <p className="text-sm text-slate-500">{t('d11.noEvents')}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {events.map((e, i) => (
            <li key={`${e.atIso}-${i}`} className="grid grid-cols-[6.5rem_1fr] gap-3 text-sm">
              <time dateTime={e.atIso} className="font-mono text-xs text-slate-500">{e.atLabel}</time>
              <span className="text-slate-900">
                {t(`d11.ev.${e.kind}` as never)} · {e.subject}
                {e.qty !== null ? ` · ${qtyLabel(e.qty)}${e.unit ? ` ${e.unit}` : ''}` : ''}
                {' · '}
                {e.by ? <span className="font-medium">{e.by}</span> : <span className="italic text-slate-500">{t('d11.unknownPerson')}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 font-mono text-[11px] text-slate-500">{t('d11.appendOnly')}</p>
    </section>
  );
}
