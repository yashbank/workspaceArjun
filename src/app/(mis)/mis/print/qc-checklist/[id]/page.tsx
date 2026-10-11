import { notFound } from 'next/navigation';

import { PrintButton } from '@/components/mis/print/print-button';
import { isUuid } from '@/lib/mis/ids';
import { addDaysToDateKey, factoryDateKey, formatFactoryDateTime } from '@/lib/mis/factory-time';
import { CHECKLIST_LABELS, buildChecklist, filterChecksToFactoryDay, type ChecklistStatus } from '@/lib/mis/qc-template';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { requireMisAccess } from '@/server/mis/guard';
import { getOrder } from '@/server/mis/orders';
import { getQcForOrder } from '@/server/mis/qc';
import { listQcTemplates } from '@/server/mis/qc-template';

const MARK: Record<ChecklistStatus, string> = { PASS: '✓', FAIL: '✗', MAKE_READY: 'MR', PLATE_ERR: 'PE' };

/** The paper form, back on paper: A4, one template, the day's taps filled in. */
export default async function QcChecklistPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ template?: string; date?: string }> }) {
  const { id } = await params;
  const { template: templateId, date } = await searchParams;
  if (!isUuid(id)) notFound();
  await requireMisAccess();
  const [order, templates, checks, timeZone] = await Promise.all([getOrder(id), listQcTemplates(true), getQcForOrder(id), getFactoryTimezone()]);
  if (!order) notFound();
  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  if (!template) notFound();
  // One sheet is one factory day: today unless ?date=YYYY-MM-DD, so yesterday's taps never fill today's cells.
  const todayKey = factoryDateKey(new Date(), timeZone);
  const dateKey = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) ? date : todayKey;
  const sheetDate = `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}/${dateKey.slice(0, 4)}`;
  const dayChecks = filterChecksToFactoryDay(checks, dateKey, timeZone);
  const dayHref = (key: string) => `/mis/print/qc-checklist/${order.id}?template=${template.id}&date=${key}`;
  const rows = buildChecklist(
    template.parameters,
    template.slots,
    dayChecks.filter((c) => c.templateId === template.id).map((c) => ({ parameterName: c.parameterName, slotTime: c.slotTime, result: c.result, defectType: c.defectType, checkTime: c.checkTime })),
  );
  const companyName = process.env.MIS_COMPANY_NAME ?? 'Bhaskar Paper Products';
  const printedAt = formatFactoryDateTime(new Date(), timeZone);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 font-sans text-sm text-gray-900">
      <div className="no-print mb-6 flex gap-3">
        <PrintButton />
        <a href={dayHref(addDaysToDateKey(dateKey, -1))} className="inline-flex min-h-11 items-center rounded border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">← Previous day</a>
        {dateKey < todayKey && <a href={dayHref(addDaysToDateKey(dateKey, 1))} className="inline-flex min-h-11 items-center rounded border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">Next day →</a>}
        <a href={`/mis/qc/${order.id}`} className="rounded border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">Back to QC</a>
      </div>
      <div className="mb-4 flex items-start justify-between border-b-2 border-gray-800 pb-3">
        <div>
          <div className="text-2xl font-bold">{companyName}</div>
          <div className="mt-1 text-base font-semibold text-gray-500">QC CHECKLIST · {template.name.toUpperCase()}</div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div className="font-mono text-lg font-bold text-gray-800">{order.orderNumber}</div>
          <div>{order.customer?.name ?? '—'}</div>
          <div className="text-sm font-semibold text-gray-800">Date: {sheetDate}</div>
          <div>Printed: {printedAt}</div>
        </div>
      </div>
      <div className="mb-6 overflow-x-auto print:overflow-visible">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="border border-gray-400 px-2 py-1 text-left">Parameter</th>
            {template.slots.map((s) => <th key={s} className="border border-gray-400 px-1 py-1 text-center">{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.parameter}>
              <td className="border border-gray-400 px-2 py-2">{r.parameter}</td>
              {r.cells.map((c) => <td key={c.slot} className="border border-gray-400 px-1 py-2 text-center font-semibold">{c.status ? MARK[c.status] : ''}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <div className="mb-8 text-xs text-gray-500">{(Object.keys(MARK) as ChecklistStatus[]).map((s) => `${MARK[s]} = ${CHECKLIST_LABELS[s]}`).join(' · ')}</div>
      <div className="mt-12 grid grid-cols-1 gap-8 border-t sm:grid-cols-3 print:grid-cols-3 border-gray-200 pt-6 text-xs text-gray-500">
        {['Operator', 'QC Inspector', 'Supervisor'].map((who) => <div key={who}><div className="h-10" /><div className="border-t border-gray-400 pt-2 text-center">{who}</div></div>)}
      </div>
    </div>
  );
}
