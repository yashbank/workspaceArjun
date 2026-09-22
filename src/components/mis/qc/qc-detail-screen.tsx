'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { AqlBreakdown } from '@/components/mis/qc/aql-breakdown';
import { addQcCheckAction, recordAqlSampleAction } from '@/app/(mis)/mis/qc/actions';
import type { AqlResult } from '@/lib/mis/aql';

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
};

type Summary = { total: number; pass: number; fail: number; totalDefectQty: number };
type Order = { id: string; orderNumber: string; status: string; customer: { name: string } | null };
type DefectTypeOption = { id: string; code: string; name: string; severity: string };
type AqlLine = { defectTypeId: string; qty: string };

interface Props {
  order: Order;
  checks: Check[];
  summary: Summary;
  canWrite: boolean;
  defectTypes: DefectTypeOption[];
}

const resultOptions: SelectOption[] = [
  { value: 'PASS', label: 'Pass' },
  { value: 'FAIL', label: 'Fail' },
  { value: 'NA', label: 'N/A' },
];

function fmt(dt: Date | string) {
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

const resultBadge = (r: string) => {
  if (r === 'PASS') return 'bg-green-100 text-green-800';
  if (r === 'FAIL') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-600';
};

const defectTypeOptions = (types: DefectTypeOption[]): SelectOption[] =>
  types.map((dt) => ({ value: dt.id, label: `${dt.name} (${dt.severity})` }));

export function QcDetailScreen({ order, checks, summary, canWrite, defectTypes }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<'PASS' | 'FAIL' | 'NA'>('PASS');
  const [parameterName, setParameterName] = useState('');
  const [defectType, setDefectType] = useState('');
  const [defectQty, setDefectQty] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  const [aqlOpen, setAqlOpen] = useState(false);
  const [aqlSampleSize, setAqlSampleSize] = useState('32');
  const [aqlLines, setAqlLines] = useState<AqlLine[]>([{ defectTypeId: '', qty: '1' }]);
  const [aqlResult, setAqlResult] = useState<AqlResult | null>(null);
  const [aqlPending, startAqlTransition] = useTransition();

  const passRate = summary.total > 0 ? Math.round((summary.pass / summary.total) * 100) : 0;

  const handleAdd = () => startTransition(async () => {
    await addQcCheckAction({
      orderId: order.id,
      result,
      parameterName: parameterName || undefined,
      defectType: defectType || undefined,
      defectQty: defectQty ? parseFloat(defectQty) : undefined,
      notes: notes || undefined,
    });
    setResult('PASS'); setParameterName(''); setDefectType(''); setDefectQty(''); setNotes('');
    setOpen(false);
  });

  const addAqlLine = () => setAqlLines((lines) => [...lines, { defectTypeId: '', qty: '1' }]);
  const removeAqlLine = (i: number) => setAqlLines((lines) => lines.filter((_, idx) => idx !== i));
  const updateAqlLine = (i: number, patch: Partial<AqlLine>) =>
    setAqlLines((lines) => lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const handleRunAql = () => startAqlTransition(async () => {
    const defects = aqlLines
      .filter((l) => l.defectTypeId && Number(l.qty) > 0)
      .map((l) => ({ defectTypeId: l.defectTypeId, qty: Number(l.qty) }));
    const outcome = await recordAqlSampleAction({
      orderId: order.id,
      sampleSize: Number(aqlSampleSize) || 0,
      defects,
    });
    setAqlResult(outcome);
    closeAql();
  });

  const closeAql = () => {
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
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{order.orderNumber}</h1>
            <StatusBadge>{order.status}</StatusBadge>
          </div>
          <p className="text-sm text-gray-500 mt-1">{order.customer?.name ?? 'No customer'}</p>
        </div>
        <div className="flex gap-2">
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
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{summary.total}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Checks</div>
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
          <div className={`text-2xl font-bold ${passRate >= 90 ? 'text-green-600' : passRate >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
            {passRate}%
          </div>
          <div className="text-xs text-gray-500 mt-0.5">Pass Rate</div>
        </div>
      </div>

      {/* Pass rate bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-gray-700">Overall Quality</span>
          <span className="text-gray-500">{passRate}% pass rate</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="bg-green-500 h-full" style={{ width: `${passRate}%` }} />
          <div className="bg-red-400 h-full" style={{ width: `${summary.total > 0 ? (summary.fail / summary.total) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Checks table */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 font-medium text-gray-700">QC Checks</div>
        {checks.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">No QC checks yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="px-5 py-3 text-left font-medium">Time</th>
                <th className="px-5 py-3 text-left font-medium">Parameter</th>
                <th className="px-5 py-3 text-left font-medium">Result</th>
                <th className="px-5 py-3 text-left font-medium">Stage</th>
                <th className="px-5 py-3 text-left font-medium">Checked By</th>
                <th className="px-5 py-3 text-left font-medium">Notes</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add check slide-over */}
      <SlideOver open={open} onClose={() => setOpen(false)} title="Add QC Check">
        <div className="flex flex-col gap-4 p-4">
          <div className="text-sm text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            Order: <span className="font-medium text-gray-800">{order.orderNumber}</span>
          </div>
          <Select label="Result" value={result} options={resultOptions} onChange={(v) => setResult(v as 'PASS' | 'FAIL' | 'NA')} />
          <Input label="Parameter Name" value={parameterName} onChange={(e) => setParameterName(e.target.value)} />
          {result === 'FAIL' && (
            <>
              <Input label="Defect Type" value={defectType} onChange={(e) => setDefectType(e.target.value)} />
              <NumberInput label="Defect Qty" value={defectQty} onChange={(e) => setDefectQty(e.target.value)} />
            </>
          )}
          <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAdd} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
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
