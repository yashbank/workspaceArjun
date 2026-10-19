'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { AqlBreakdown } from '@/components/mis/qc/aql-breakdown';
import { addQcCheckAction, editQcCheckAction, recordAqlSampleAction } from '@/app/(mis)/mis/qc/actions';
import { voidQcCheckAction } from '@/app/(mis)/mis/qc/correction-actions';
import type { AqlResult } from '@/lib/mis/aql';
import type { QcTemplateRow } from '@/server/mis/qc-template';
import { QcChecklist } from '@/components/mis/qc/qc-checklist';
import { fmtDate, fmtTime } from '@/lib/mis/client-dates';

type Check = {
  id: string;
  checkTime: Date | string;
  result: string;
  parameterName?: string | null;
  defectType?: string | null;
  defectQty?: number | string | null;
  notes?: string | null;
  stage?: { stageName: string } | null;
  checkBy?: { name: string } | null;
  templateId?: string | null;
  slotTime?: string | null;
  /** Server-computed (B84 / R2-34): the correction rule, not acknowledged, order open. Never derived from the browser clock. */
  editable?: boolean;
  /** Server-computed (R2-34): may this viewer delete (void) the check. */
  deletable?: boolean;
};

type Summary = { total: number; pass: number; fail: number; na?: number; totalDefectQty: number };
type Order = { id: string; orderNumber: string; status: string; customer: { name: string } | null };
type DefectTypeOption = { id: string; code: string; name: string; severity: string };
type AqlLine = { defectTypeId: string; qty: string };

interface Props {
  order: Order;
  checks: Check[];
  summary: Summary;
  canWrite: boolean;
  defectTypes: DefectTypeOption[];
  /** Stages of this order's BOM (#33); empty when it has none. */
  stages?: SelectOption[];
  /** V2 Epic 5 — the paper forms; empty until the templates migration is applied. */
  templates?: QcTemplateRow[];
  /** The factory day the checklist shows (server-computed), so another day's taps never fill today's cells. */
  checklistDay?: { dateKey: string; timeZone: string };
}

const resultOptions: SelectOption[] = [
  { value: 'PASS', label: 'Pass' },
  { value: 'FAIL', label: 'Fail' },
  { value: 'NA', label: 'N/A' },
];

function fmt(dt: Date | string) {
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  return fmtDate(d, { day: '2-digit', month: 'short' }) + ' ' + fmtTime(d, { hour: '2-digit', minute: '2-digit', hour12: true });
}

const resultBadge = (r: string) => {
  if (r === 'PASS') return 'bg-green-100 text-green-800';
  if (r === 'FAIL') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-600';
};

const defectTypeOptions = (types: DefectTypeOption[]): SelectOption[] =>
  types.map((dt) => ({ value: dt.id, label: `${dt.name} (${dt.severity})` }));

// '' is the sentinel for "not in the master" — QC holds masters.read, not masters.write, so a
// defect that is not yet classified must still be recordable, as free text (F-19/D14).
const OTHER_DEFECT = '';

export function QcDetailScreen({ order, checks, summary, canWrite, defectTypes, stages = [], templates = [], checklistDay }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<'PASS' | 'FAIL' | 'NA'>('PASS');
  const [stageId, setStageId] = useState<string | null>(null);
  const [parameterName, setParameterName] = useState('');
  const [defectTypeCode, setDefectTypeCode] = useState(OTHER_DEFECT);
  const [defectTypeOther, setDefectTypeOther] = useState('');
  const [defectQty, setDefectQty] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  const [aqlOpen, setAqlOpen] = useState(false);
  const [aqlSampleSize, setAqlSampleSize] = useState('32');
  const [aqlLines, setAqlLines] = useState<AqlLine[]>([{ defectTypeId: '', qty: '1' }]);
  const [aqlResult, setAqlResult] = useState<AqlResult | null>(null);
  const [aqlPending, startAqlTransition] = useTransition();

  const [error, setError] = useState<string | null>(null);
  const [aqlError, setAqlError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Check | null>(null);
  const [editResult, setEditResult] = useState<'PASS' | 'FAIL' | 'NA'>('PASS');
  const [editParameter, setEditParameter] = useState('');
  const [editDefectType, setEditDefectType] = useState('');
  const [editDefectQty, setEditDefectQty] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editPending, startEditTransition] = useTransition();
  const [deleting, setDeleting] = useState<Check | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  // R3-QCR B79: N/A is neither a pass nor a fail, so it is left out of the rate (and shown on its own).
  const decided = summary.pass + summary.fail;
  const passRate = decided > 0 ? Math.round((summary.pass / decided) * 100) : null;

  const plainDefectTypeOptions: SelectOption[] = [
    { value: OTHER_DEFECT, label: 'Not listed — describe below' },
    ...defectTypes.map((dt) => ({ value: dt.code, label: `${dt.name} (${dt.severity})` })),
  ];

  const handleAdd = () => startTransition(async () => {
    setError(null);
    const outcome = await addQcCheckAction({
      orderId: order.id,
      result,
      bomStageId: stageId ?? undefined,
      parameterName: parameterName || undefined,
      defectType: (defectTypeCode || defectTypeOther.trim()) || undefined,
      defectQty: defectQty ? parseFloat(defectQty) : undefined,
      notes: notes || undefined,
    });
    if (!outcome.ok) { setError(outcome.detail); return; }
    setResult('PASS'); setStageId(null); setParameterName(''); setDefectTypeCode(OTHER_DEFECT); setDefectTypeOther(''); setDefectQty(''); setNotes('');
    setOpen(false);
  });

  const addAqlLine = () => setAqlLines((lines) => [...lines, { defectTypeId: '', qty: '1' }]);
  const removeAqlLine = (i: number) => setAqlLines((lines) => lines.filter((_, idx) => idx !== i));
  const updateAqlLine = (i: number, patch: Partial<AqlLine>) =>
    setAqlLines((lines) => lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const handleRunAql = () => startAqlTransition(async () => {
    setAqlError(null);
    // R3-QCR B72: a blank is a blank, never a silent 0.
    if (aqlSampleSize.trim() === '') { setAqlError('Enter the sample size'); return; }
    const defects = aqlLines
      .filter((l) => l.defectTypeId && Number(l.qty) > 0)
      .map((l) => ({ defectTypeId: l.defectTypeId, qty: Number(l.qty) }));
    const outcome = await recordAqlSampleAction({
      orderId: order.id,
      sampleSize: Number(aqlSampleSize),
      defects,
    });
    if (!outcome.ok) { setAqlError(outcome.detail); return; }
    setAqlResult(outcome.value);
    closeAql();
  });

  const openEdit = (c: Check) => {
    setEditing(c);
    setEditResult((c.result === 'PASS' || c.result === 'FAIL' ? c.result : 'NA') as 'PASS' | 'FAIL' | 'NA');
    setEditParameter(c.parameterName ?? '');
    setEditDefectType(c.defectType ?? '');
    setEditDefectQty(c.defectQty == null ? '' : String(c.defectQty));
    setEditNotes(c.notes ?? '');
    setEditReason('');
    setEditError(null);
  };

  const handleDelete = () => startEditTransition(async () => {
    if (!deleting) return;
    setEditError(null);
    const outcome = await voidQcCheckAction(deleting.id, deleteReason.trim());
    if (!outcome.ok) { setEditError(outcome.detail); return; }
    setDeleting(null);
  });

  const handleEdit = () => startEditTransition(async () => {
    if (!editing) return;
    setEditError(null);
    const outcome = await editQcCheckAction(editing.id, {
      result: editResult,
      parameterName: editParameter.trim() || undefined,
      defectType: editDefectType.trim() || null,
      defectQty: editDefectQty.trim() === '' ? null : Number(editDefectQty),
      notes: editNotes.trim() || null,
      reason: editReason.trim(),
    });
    if (!outcome.ok) { setEditError(outcome.detail); return; }
    setEditing(null);
  });

  const closeAql = () => {
    setAqlError(null);
    setAqlOpen(false);
    setAqlSampleSize('32');
    setAqlLines([{ defectTypeId: '', qty: '1' }]);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/mis/qc" className="inline-flex min-h-11 items-center hover:text-gray-700">QC</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{order.orderNumber}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
            <StatusBadge>{order.status}</StatusBadge>
          </div>
          <p className="text-sm text-gray-500 mt-1">{order.customer?.name ?? 'No customer'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/mis/qc/grid?view=capture&orderId=${order.id}`}>
            <Button variant="ghost">Hourly Grid</Button>
          </Link>
          <Link href={`/mis/print/coa/${order.id}`} target="_blank">
            <Button variant="ghost">Print CoA</Button>
          </Link>
          {canWrite && <Button variant="ghost" onClick={() => setAqlOpen(true)}>Run AQL Sample</Button>}
          {canWrite && <Button onClick={() => setOpen(true)}>+ Add Check</Button>}
        </div>
      </div>

      {aqlResult && <AqlBreakdown result={aqlResult} />}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Checks</div>
          {(summary.na ?? 0) > 0 && <div className="text-xs text-gray-400">N/A: {summary.na}</div>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{summary.pass}</div>
          <div className="text-xs text-gray-500 mt-0.5">Pass</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{summary.fail}</div>
          <div className="text-xs text-gray-500 mt-0.5">Fail</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className={`text-2xl font-bold ${passRate === null ? 'text-gray-400' : passRate >= 90 ? 'text-green-600' : passRate >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
            {passRate === null ? '—' : `${passRate}%`}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Pass Rate</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{summary.totalDefectQty}</div>
          <div className="text-xs text-gray-500 mt-0.5">Defects (failed checks)</div>
        </div>
      </div>

      {/* Pass rate bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-gray-700">Overall Quality</span>
          <span className="text-gray-500">{passRate === null ? '—' : `${passRate}% pass rate`}</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="bg-green-500 h-full" style={{ width: `${passRate ?? 0}%` }} />
          <div className="bg-red-400 h-full" style={{ width: `${decided > 0 ? (summary.fail / decided) * 100 : 0}%` }} />
        </div>
      </div>

      {templates.length > 0 && (
        <QcChecklist
          orderId={order.id}
          templates={templates}
          canWrite={canWrite}
          day={checklistDay}
          checks={checks.map((c) => ({ parameterName: c.parameterName ?? null, slotTime: c.slotTime ?? null, result: c.result, defectType: c.defectType ?? null, checkTime: new Date(c.checkTime), templateId: c.templateId ?? null }))}
        />
      )}

      {/* Checks table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 font-medium text-gray-700">QC Checks</div>
        {checks.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No QC checks yet.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-5 py-3 text-left font-medium">Time</th>
                <th className="px-5 py-3 text-left font-medium">Parameter</th>
                <th className="px-5 py-3 text-left font-medium">Result</th>
                <th className="px-5 py-3 text-left font-medium">Stage</th>
                <th className="px-5 py-3 text-left font-medium">Checked By</th>
                <th className="px-5 py-3 text-left font-medium">Notes</th>
                {canWrite && <th className="px-5 py-3 text-left font-medium"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {checks.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmt(c.checkTime)}</td>
                  <td className="px-5 py-3 text-gray-700">{c.parameterName ?? 'General'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${resultBadge(c.result)}`}>{c.result}</span>
                    {c.defectType && <span className="ml-2 text-xs text-gray-400">{c.defectType}</span>}
                  </td>
                  <td className="px-5 py-3 text-gray-500">{c.stage?.stageName ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{c.checkBy?.name ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-400 max-w-xs truncate">{c.notes ?? '—'}</td>
                  {canWrite && (
                    <td className="px-5 py-3 whitespace-nowrap">
                      {c.editable && <Button variant="ghost" onClick={() => openEdit(c)}>Edit</Button>}
                      {c.deletable && (
                        <Button variant="ghost" onClick={() => { setDeleting(c); setDeleteReason(''); setEditError(null); }}>
                          Delete
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Add check slide-over */}
      <SlideOver open={open} onClose={() => setOpen(false)} title="Add QC Check">
        <div className="flex flex-col gap-4 p-4">
          <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Order: <span className="font-medium text-gray-800">{order.orderNumber}</span>
          </div>
          <Select label="Result" value={result} options={resultOptions} onChange={(v) => setResult(v as 'PASS' | 'FAIL' | 'NA')} />
          {stages.length > 0 && (
            <Select label="Process / BOM stage (optional)" value={stageId} options={stages} onChange={setStageId} placeholder="Select a stage…" />
          )}
          <Input label="Parameter Name" value={parameterName} onChange={(e) => setParameterName(e.target.value)} />
          {result === 'FAIL' && (
            <>
              <Select label="Defect Type" value={defectTypeCode} options={plainDefectTypeOptions} onChange={setDefectTypeCode} />
              {defectTypeCode === OTHER_DEFECT && (
                <Input label="Describe the defect" value={defectTypeOther} onChange={(e) => setDefectTypeOther(e.target.value)} />
              )}
              <NumberInput label="Defect Qty" value={defectQty} onChange={(e) => setDefectQty(e.target.value)} />
            </>
          )}
          <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAdd} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      {/* Edit check slide-over (B84 / R2-34: Admin/Owner 7 days; QC own checks same day; reason required) */}
      <SlideOver open={editing !== null} onClose={() => setEditing(null)} title="Edit QC Check">
        <div className="flex flex-col gap-4 p-4">
          <Select label="Result" value={editResult} options={resultOptions} onChange={(v) => setEditResult(v as 'PASS' | 'FAIL' | 'NA')} />
          <Input label="Parameter Name" value={editParameter} onChange={(e) => setEditParameter(e.target.value)} />
          <Input label="Defect type" value={editDefectType} onChange={(e) => setEditDefectType(e.target.value)} />
          <NumberInput label="Defect Qty" value={editDefectQty} onChange={(e) => setEditDefectQty(e.target.value)} />
          <Input label="Notes" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
          <Input label="Reason for the change" value={editReason} onChange={(e) => setEditReason(e.target.value)} />
          {editError && <p role="alert" className="text-sm text-red-700">{editError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleEdit} disabled={editPending}>{editPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      {/* Delete check slide-over (R2-34: voided with a reason; the audit log keeps it) */}
      <SlideOver open={deleting !== null} onClose={() => setDeleting(null)} title="Delete QC Check">
        <div className="flex flex-col gap-4 p-4">
          {deleting && (
            <p className="text-sm text-gray-600">
              {fmt(deleting.checkTime)} · {deleting.parameterName ?? 'General'} · {deleting.result}. It leaves the CoA and every summary; the audit log keeps it.
            </p>
          )}
          <Input label="Reason for deleting" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
          {editError && <p role="alert" className="text-sm text-red-700">{editError}</p>}
          <div className="flex gap-2 pt-2">
            <Button variant="danger" onClick={handleDelete} disabled={editPending || deleteReason.trim().length < 3}>Delete check</Button>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      {/* Run AQL sample slide-over */}
      <SlideOver open={aqlOpen} onClose={closeAql} title="Run AQL Sample">
        <div className="flex flex-col gap-4 p-4">
          <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Order: <span className="font-medium text-gray-800">{order.orderNumber}</span>
          </div>
          <NumberInput label="Sample Size" value={aqlSampleSize} onChange={(e) => setAqlSampleSize(e.target.value)} />
          {aqlError && <p role="alert" className="text-sm text-red-700">{aqlError}</p>}

          <div className="flex flex-col gap-3">
            <div className="text-sm font-medium text-slate-700">Defects found</div>
            {aqlLines.map((line, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <Select
                    label={`Defect type ${i + 1}`}
                    value={line.defectTypeId || null}
                    options={defectTypeOptions(defectTypes)}
                    onChange={(v) => updateAqlLine(i, { defectTypeId: v })}
                  />
                </div>
                <div className="w-24">
                  <NumberInput label="Qty" value={line.qty} onChange={(e) => updateAqlLine(i, { qty: e.target.value })} />
                </div>
                {aqlLines.length > 1 && (
                  <Button variant="ghost" onClick={() => removeAqlLine(i)}>×</Button>
                )}
              </div>
            ))}
            <Button variant="ghost" onClick={addAqlLine}>+ Add defect line</Button>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleRunAql} disabled={aqlPending}>{aqlPending ? 'Evaluating…' : 'Evaluate'}</Button>
            <Button variant="ghost" onClick={closeAql}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
