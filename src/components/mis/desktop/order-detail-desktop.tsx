'use client';

import Link from 'next/link';

import { resolveLabel } from '@/lib/mis/i18n';
import type { OrderDesktopData, PhaseRowView, BlockerView } from '@/lib/mis/order-desktop';
import type { PhaseState, QcSlot } from '@/lib/mis/order-timeline';
import { cn } from '@/lib/utils';

import { useMisLocale, useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';

/**
 * D4 — "One order, and the reason it is not moving."
 *
 * **NO MONEY ON THIS SCREEN.** D4 says so in its own words: "Not order value, not material
 * cost, not a margin. This is the busiest screen in the system and the most shoulder-surfed;
 * the rupee stays on the Owner's dashboard and the BOM costing overlay." That is enforced by
 * the TYPE below, not by discipline: `OrderDesktopData` has no rupee field, no rate and no
 * wage, and the page that builds it never asks for one. A screen cannot leak a field it was
 * never given.
 *
 * The blocker is INSIDE the phase, not in a banner — "a banner at the top of the page gets
 * dismissed; a red block inside the row that needs work does not."
 */

/** How many BOM lines the card previews; the rest are one link away. */
const BOM_PREVIEW = 6;

const num = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);

export function OrderDetailDesktop({ data }: { data: OrderDesktopData }) {
  const t = useT();
  const { locale } = useMisLocale();
  const { progress } = data;
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const firstBlocker = data.phases.flatMap((p) => p.blockers)[0] ?? null;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/mis/production" className="hover:underline">{t('nav.production')}</Link>
        <span aria-hidden="true">/</span>
        <Link href="/mis/orders" className="hover:underline">{t('nav.orders')}</Link>
        <span aria-hidden="true">/</span>
        <span className="font-mono font-semibold text-slate-900">{data.orderNumber}</span>
      </nav>

      <DesktopPageHeader
        title={data.orderNumber}
        summary={data.description ?? undefined}
        secondary={
          <>
            <Link
              href={`/mis/orders/${data.orderId}?view=classic`}
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {t('d4.allDetails')}
            </Link>
            <Link
              href={`/mis/print/job-card/${data.orderId}`}
              target="_blank"
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              {t('d4.printJobCard')}
            </Link>
          </>
        }
        primary={
          // ONE primary action, and it is the NEXT one — "the action for the phase that is
          // actually running, not a generic Edit". Absent when this person may not sign it.
          data.signOff ? (
            <Link
              href={`/mis/production/sign-off/${data.signOff.phaseId}`}
              aria-describedby={data.signOff.blockedReasons > 0 ? 'signoff-why' : undefined}
              className="inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {t('d4.signOff')} {data.signOff.name.toLowerCase()}
            </Link>
          ) : undefined
        }
      />

      <div className="-mt-2 mb-5 flex flex-wrap items-center gap-2">
        {data.position ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
            {t('d4.phase')} {data.position.at} {t('d4.of')} {data.position.of} · {data.position.name}
          </span>
        ) : null}
        {firstBlocker ? (
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800">
            {blockerTitle(firstBlocker, t)}
          </span>
        ) : null}
        {data.signOff && data.signOff.blockedReasons > 0 ? (
          <span id="signoff-why" className="text-xs text-red-700">
            {t('d4.signOffWhy')}: {data.signOff.blockedReasons}
          </span>
        ) : null}
      </div>

      {progress.total > 0 ? (
        <div className="mb-5 flex items-center gap-3">
          <span className="h-2 max-w-sm flex-1 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${progress.done} ${t('d4.of')} ${progress.total}`}>
            <span className="block h-full rounded-full bg-indigo-600" style={{ width: `${pct}%` }} />
          </span>
          {data.deliveryLabel ? (
            <span className="font-mono text-xs text-slate-500">
              {t('d4.delivery')} {data.deliveryLabel}
              {data.daysLeft !== null ? ` · ${daysLabel(data.daysLeft, t)}` : ''}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardTitle right={t('d4.eachPhaseSigned')}>{t('d4.processSequence')}</CardTitle>
            {data.phases.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                {t('d4.noPhasePlan')}
              </p>
            ) : (
              <ol className="flex flex-col">
                {data.phases.map((phase, index) => (
                  <PhaseRow key={phase.id} phase={phase} last={index === data.phases.length - 1} locale={locale} />
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardTitle right={data.bom ? `${data.bom.statusLabel} · ${data.bom.items.length} ${t('d4.items')}` : undefined}>
              {t('d4.bom')}
            </CardTitle>
            {data.bom && data.bom.items.length > 0 ? (
              <>
                <ul className="grid grid-cols-2 gap-4">
                  {data.bom.items.slice(0, BOM_PREVIEW).map((item) => (
                    <li key={item.id} className="min-w-0">
                      <p className="truncate text-xs text-slate-500">{item.description}</p>
                      <p className="font-mono text-lg font-semibold text-slate-900">
                        {item.quantity} <span className="text-sm font-normal text-slate-400">{item.unit} {t('d4.planned')}</span>
                      </p>
                    </li>
                  ))}
                </ul>
                {data.bom.items.length > BOM_PREVIEW ? (
                  // The heading counts ALL items, so a card that shows fewer must say how many it is
                  // leaving out — a silently shortened list reads as a complete one.
                  <p className="mt-3 text-sm text-slate-500">
                    +{data.bom.items.length - BOM_PREVIEW} {t('d4.moreItems')}
                  </p>
                ) : null}
                <p className="mt-3 font-mono text-[11px] text-slate-500">{t('d4.issuedNote')}</p>
                <Link href={`/mis/bom/${data.orderId}`} className="mt-1 inline-block text-sm font-medium text-indigo-700 hover:underline">
                  {t('d4.openBom')}
                </Link>
              </>
            ) : (
              <p className="text-sm text-slate-500">{t('d4.noBom')}</p>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardTitle>{t('d4.order')}</CardTitle>
            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
              <Row label={t('d4.customer')} value={data.customer} />
              <Row label={t('d4.status')} value={data.status} />
              <Row label={t('d4.received')} value={data.receivedLabel} mono />
              <Row label={t('d4.delivery')} value={data.deliveryLabel} mono />
            </dl>
            <p className="mt-3 font-mono text-[11px] text-slate-500">{t('d4.notRecorded')}</p>
          </Card>

          <Card>
            <CardTitle right={data.quality.strip.length > 0 ? `${data.quality.strip.length} ${t('d4.hourlyChecks')}` : undefined}>
              {t('d4.quality')}
            </CardTitle>
            {data.quality.taken === 0 && data.quality.strip.every((s) => s.state !== 'PASS' && s.state !== 'FAIL') ? (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
                {t('empty.noQc')}
              </p>
            ) : (
              <>
                <ul className="flex gap-1.5" aria-label={t('d4.quality')}>
                  {data.quality.strip.map((slot) => (
                    <li
                      key={slot.hour}
                      title={`${pad(slot.hour % 24)}:00 · ${t(`d4.slot.${slot.state}` as never)}`}
                      aria-label={`${pad(slot.hour % 24)}:00 ${t(`d4.slot.${slot.state}` as never)}`}
                      className={cn('h-7 flex-1 rounded-md border', slotStyle(slot.state))}
                    />
                  ))}
                </ul>
                {data.quality.strip.length > 0 ? (
                  <p className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
                    <span>{pad(data.quality.strip[0].hour % 24)}:00</span>
                    <span>{pad((data.quality.strip[data.quality.strip.length - 1].hour + 1) % 24)}:00</span>
                  </p>
                ) : null}
                <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-2 border-t border-slate-200 pt-3 text-sm">
                  <Row label={t('d4.passed')} value={`${data.quality.passed} ${t('d4.of')} ${data.quality.taken} ${t('d4.taken')}`} bold />
                  {data.quality.openDefect ? (
                    <Row
                      label={t('d4.openDefect')}
                      value={[data.quality.openDefect.parameter, data.quality.openDefect.defectType].filter(Boolean).join(' · ') || t('d4.blocker.qc')}
                      danger
                    />
                  ) : null}
                </dl>
              </>
            )}
          </Card>

          <Card>
            <CardTitle right={String(data.documents.length)}>{t('d4.documents')}</CardTitle>
            {data.documents.length === 0 ? (
              <p className="text-sm text-slate-500">{t('d4.noDocuments')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {data.documents.map((doc) => (
                  <li key={doc.id} className="rounded-xl border border-slate-200 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{doc.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{doc.meta}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/mis/documents" className="mt-3 inline-block text-sm font-medium text-indigo-700 hover:underline">
              {t('d4.attach')}
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PhaseRow({ phase, last, locale }: { phase: PhaseRowView; last: boolean; locale: 'en' | 'hi' }) {
  const t = useT();
  const running = phase.state.kind === 'RUNNING' || phase.state.kind === 'REOPENED';
  const label = resolveLabel(phase.name, phase.nameHi, locale);

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0" aria-current={running ? 'step' : undefined}>
      {!last ? <span aria-hidden="true" className="absolute left-[17px] top-10 bottom-0 w-px bg-slate-200" /> : null}
      <span
        className={cn(
          'relative z-10 flex size-9 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold',
          phase.state.kind === 'SIGNED' && 'bg-green-100 text-green-800',
          running && 'bg-[#171310] text-white',
          phase.state.kind !== 'SIGNED' && !running && 'bg-[#f1ebdf] text-slate-500',
        )}
      >
        {String(phase.sequence).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-slate-900">{label}</span>
          <StateChip state={phase.state} signedAt={phase.signedAtLabel} startedAt={phase.startedAtLabel} />
        </p>
        {phase.detail ? <p className="text-sm text-slate-600">{phase.detail}</p> : null}

        {running ? (
          <>
            {phase.figures ? (
              <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1">
                <Figure label={t('d4.output')}>
                  {num(phase.figures.produced)}
                  {phase.figures.handedOver !== null ? <span className="text-slate-400"> / {num(phase.figures.handedOver)}</span> : null}
                </Figure>
                <Figure label={t('d4.wastage')}>
                  {num(phase.figures.waste)} <span className="text-slate-400">{phase.figures.unit}</span>
                </Figure>
                {phase.startedAtLabel ? <Figure label={t('d4.started')}>{phase.startedAtLabel}</Figure> : null}
                {phase.plannedEndLabel ? <Figure label={t('d4.plannedEnd')}>{phase.plannedEndLabel}</Figure> : null}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-500">{t('d4.nothingYet')}</p>
            )}

            {/* The blocker sits INSIDE the phase that owns it. */}
            {phase.blockers.map((blocker, i) => (
              <div key={i} role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="font-semibold text-red-800">{blockerTitle(blocker, t)}</p>
                <p className="text-sm text-red-700">
                  {blockerDetail(blocker)}
                  {blockerDetail(blocker) ? ' · ' : ''}
                  {t('d4.blocker.cannotSign')}
                </p>
              </div>
            ))}
          </>
        ) : null}
      </div>
    </li>
  );
}

function StateChip({ state, signedAt, startedAt }: { state: PhaseState; signedAt: string | null; startedAt: string | null }) {
  const t = useT();
  const base = 'rounded-full border px-2 py-0.5 text-[11px] font-semibold';
  switch (state.kind) {
    case 'SIGNED':
      return <span className={cn(base, 'border-green-200 bg-green-50 text-green-800')}>{t('d4.signed')}{signedAt ? ` ${signedAt}` : ''}</span>;
    case 'RUNNING':
      return <span className={cn(base, 'border-amber-200 bg-amber-50 text-amber-900')}>{t('d4.running')}{startedAt ? ` · ${startedAt}` : ''}</span>;
    case 'REOPENED':
      return <span className={cn(base, 'border-amber-200 bg-amber-50 text-amber-900')}>{t('d4.reopened')}</span>;
    case 'BLOCKED':
      return <span className={cn(base, 'border-slate-300 bg-[#f1ebdf] text-slate-700')}>{t('d4.blockedBy')} {state.bySequence}</span>;
    case 'NOT_APPLICABLE':
      return <span className={cn(base, 'border-slate-200 bg-white text-slate-500')}>{t('d4.notApplicable')}</span>;
    default:
      return <span className={cn(base, 'border-slate-300 bg-[#f1ebdf] text-slate-600')}>{t('d4.notStarted')}</span>;
  }
}

function blockerTitle(blocker: BlockerView, t: (k: never) => string): string {
  if (blocker.kind === 'QC_FAILURE') return blocker.parameter ? `${blocker.parameter} — ${t('d4.blocker.qc' as never)}` : t('d4.blocker.qc' as never);
  if (blocker.kind === 'WASTE_REASON') return t('d4.blocker.waste' as never);
  return t('d4.blocker.noProduction' as never);
}

function blockerDetail(blocker: BlockerView): string {
  if (blocker.kind === 'QC_FAILURE') return blocker.timeLabel;
  if (blocker.kind === 'WASTE_REASON') return `${num(blocker.qtyWaste)} · ${blocker.timeLabel}`;
  return '';
}

function daysLabel(days: number, t: (k: never) => string): string {
  if (days === 0) return t('d4.dueToday' as never);
  return days > 0 ? `${days} ${t('d4.daysLeft' as never)}` : `${Math.abs(days)} ${t('d4.overdue' as never)}`;
}

function slotStyle(state: QcSlot['state']): string {
  switch (state) {
    case 'PASS':
      return 'border-green-200 bg-green-100';
    case 'FAIL':
      return 'border-red-600 bg-red-100';
    case 'MISSED':
      // dashed = never recorded (MIS_UI_SPEC §4.4 rule 6), distinct from a recorded state.
      return 'border-dashed border-slate-400 bg-transparent';
    default:
      return 'border-[#e7dfd0] bg-[#f1ebdf]';
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

function Card({ children }: { children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">{children}</section>;
}

function CardTitle({ children, right }: { children: React.ReactNode; right?: string }) {
  return (
    <header className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-900">{children}</h2>
      {right ? <span className="text-right text-xs text-slate-500">{right}</span> : null}
    </header>
  );
}

function Row({ label, value, mono, bold, danger }: { label: string; value: string | null; mono?: boolean; bold?: boolean; danger?: boolean }) {
  if (value === null || value === '') return null;
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn('text-slate-900', mono && 'font-mono', bold && 'font-semibold', danger && 'font-semibold text-red-700')}>{value}</dd>
    </>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="font-mono text-base font-semibold text-slate-900">{children}</dd>
    </div>
  );
}
