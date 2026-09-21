'use client';

import Link from 'next/link';

import type { BomDesktopData } from '@/lib/mis/bom-desktop';
import { cn } from '@/lib/utils';

import { useT } from '../shell/locale-provider';
import { DesktopPageHeader } from './desktop-shell';

/**
 * D6 — "One tree. The Owner sees an extra column, not a different screen."
 *
 * **The rupee is not decided here.** This component draws whatever `BomDesktopData` carries. For
 * every role but the Owner the object has no `cost`, `subtotal` or `costing` key at all (D24 — see
 * `getBomDesktopView`), so there is nothing here to hide and no `if (isOwner)` that could be
 * forgotten: the cost column exists only because `data.costing` does. Money arrives as formatted
 * strings; nothing in this file multiplies or adds.
 *
 * "Not priced" is a fact and ₹0 is a lie: a line with no rate says `not priced`, and a total that
 * leaves such a line out is labelled a floor.
 *
 * What the artboard shows but nothing records is left out rather than invented: versions and their
 * approvers, "clone from existing", per-unit and rolled-up-to-N quantities (orders carry no
 * quantity, D13), and the per-unit cost. The Versions card says so.
 */

const pretty = (status: string) => {
  const s = status.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export function BomDesktop({ data }: { data: BomDesktopData }) {
  const t = useT();
  const costing = data.costing;
  const cols = costing ? 3 : 2;

  return (
    <div>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-sm text-slate-500">
        <Link href="/mis/production" className="inline-flex min-h-11 items-center hover:underline">{t('nav.production')}</Link>
        <span aria-hidden="true">/</span>
        <Link href="/mis/bom" className="inline-flex min-h-11 items-center hover:underline">{t('d6.breadcrumb')}</Link>
        <span aria-hidden="true">/</span>
        <span className="font-mono font-semibold text-slate-900">{data.orderNumber}</span>
      </nav>

      <DesktopPageHeader
        title={data.description ?? data.orderNumber}
        summary={`${data.orderNumber} · ${data.itemCount} ${t('d6.items')} · ${data.stages.length} ${t('d6.stages')}`}
        secondary={
          data.canCost ? (
            // A link, not a client toggle: turning costing off reloads the page WITHOUT the column
            // (D6: "refetches without the column rather than hiding it").
            <Link
              href={costing ? `/mis/bom/${data.orderId}?costing=off` : `/mis/bom/${data.orderId}`}
              aria-label={costing ? t('d6.costingOn') : t('d6.costingOff')}
              className={cn(
                'inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold',
                costing ? 'border-[#171310] bg-[#171310] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
              )}
            >
              {costing ? t('d6.costingOn') : t('d6.costingOff')}
            </Link>
          ) : undefined
        }
        primary={
          data.canEdit ? (
            <Link
              href={`/mis/bom/${data.orderId}?view=edit`}
              className="inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {t('d6.editStructure')}
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">{t('d6.structure')}</h2>
            <span className="text-xs text-slate-500">{t('d6.structureNote')}</span>
          </header>

          {data.stages.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              {t('d6.noStages')}
            </p>
          ) : (
            <table aria-label={t('d6.structure')} className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left font-mono text-[10px] uppercase tracking-wider text-slate-500">
                  <th scope="col" className="py-2 font-medium">{t('d6.col.item')}</th>
                  <th scope="col" className="py-2 text-right font-medium">{t('d6.col.quantity')}</th>
                  {costing ? <th scope="col" className="py-2 text-right font-medium">{t('d6.col.cost')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.stages.map((stage) => (
                  <StageRows key={stage.id} stage={stage} withCost={!!costing} cols={cols} />
                ))}
              </tbody>
            </table>
          )}

          {costing ? (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="flex items-baseline justify-between gap-4">
                <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">{t('d6.rolledUp')}</span>
                <span className="font-mono text-2xl font-bold text-slate-900">
                  {costing.total}
                  {costing.isFloor ? <span className="ml-2 align-middle text-xs font-normal text-slate-500">{t('d6.floor')}</span> : null}
                </span>
              </p>
              {costing.isFloor ? (
                <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
                  {costing.unpriced === 1 ? t('d6.floorWarningOne') : `${t('d6.floorWarning')} (${costing.unpriced})`}
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="mt-4 font-mono text-[11px] text-slate-500">{t('d6.perUnitNotRecorded')}</p>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          <Card title={t('d6.current')}>
            <dl className="grid grid-cols-[90px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">{t('d6.status')}</dt>
              <dd className="font-semibold text-slate-900">{pretty(data.bomStatus)}</dd>
              <dt className="text-slate-500">{t('d6.approved')}</dt>
              <dd className="font-mono text-slate-900">{data.approvedLabel ?? t('d6.notApproved')}</dd>
            </dl>
            <p className="mt-3 font-mono text-[11px] text-slate-500">{t('d6.versionsNotRecorded')}</p>
          </Card>

          {data.canCost ? (
            <section className="rounded-2xl bg-[#171310] p-5 text-white">
              <header className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-semibold">{t('d6.overlay')}</h2>
                <span className="text-xs text-slate-300">{t('d6.ownerOnly')}</span>
              </header>
              <p className="text-sm leading-relaxed text-slate-200">{t('d6.overlayBody')}</p>
              {costing ? (
                <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-white/15 pt-4">
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{t('d6.priced')}</dt>
                    <dd className="font-mono text-2xl font-bold">{costing.priced}</dd>
                  </div>
                  <div>
                    <dt className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{t('d6.unpriced')}</dt>
                    <dd className="font-mono text-2xl font-bold">{costing.unpriced}</dd>
                  </div>
                </dl>
              ) : null}
              <p className="mt-3 font-mono text-[11px] text-slate-400">{t('d6.overlayToggle')}</p>
            </section>
          ) : null}

          <Card title={t('d6.usedBy')}>
            <Link href={`/mis/orders/${data.orderId}`} className="inline-flex min-h-11 items-center font-mono text-sm font-semibold text-indigo-700 hover:underline">
              {data.orderNumber}
            </Link>
            <p className="mt-2 font-mono text-[11px] text-slate-500">{t('d6.usedByOne')}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StageRows({ stage, withCost, cols }: { stage: BomDesktopData['stages'][number]; withCost: boolean; cols: number }) {
  const t = useT();
  return (
    <>
      {/* Depth is indent and a hairline, never colour (D6): a stage is a tinted, bold row; its lines are indented. */}
      <tr className="bg-[#f1ebdf]">
        <th scope="row" colSpan={2} className="py-2.5 pl-3 text-left font-semibold text-slate-900">
          {stage.name}
        </th>
        {withCost ? (
          <td className="py-2.5 pr-3 text-right font-mono font-semibold text-slate-900">
            {stage.subtotal === undefined ? null : stage.subtotal === null ? (
              <span className="font-normal italic text-slate-500">{t('d6.notPriced')}</span>
            ) : (
              <>
                {stage.subtotal}
                {stage.unpriced ? (
                  <span className="ml-2 text-[11px] font-normal italic text-slate-500">
                    +{stage.unpriced} {t('d6.unpricedInStage')}
                  </span>
                ) : null}
              </>
            )}
          </td>
        ) : null}
      </tr>
      {stage.materials.length === 0 ? (
        <tr>
          <td colSpan={cols} className="py-2 pl-8 text-slate-500">{t('d6.noItems')}</td>
        </tr>
      ) : (
        stage.materials.map((m) => (
          <tr key={m.id} className="border-b border-slate-100">
            <td className="border-l border-slate-200 py-2.5 pl-6 text-slate-900">{m.description}</td>
            <td className="py-2.5 text-right font-mono text-slate-700">
              {m.quantity} <span className="text-slate-400">{m.unit}</span>
            </td>
            {withCost ? (
              <td className="py-2.5 pr-3 text-right font-mono font-semibold text-slate-900">
                {m.cost === undefined ? null : m.cost === null ? (
                  <span className="font-normal italic text-slate-500" title={t('d6.noRate')}>{t('d6.notPriced')}</span>
                ) : (
                  m.cost
                )}
              </td>
            ) : null}
          </tr>
        ))
      )}
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-3 text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
