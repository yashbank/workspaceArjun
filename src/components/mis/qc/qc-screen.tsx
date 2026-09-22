'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { addQcCheckAction } from '@/app/(mis)/mis/qc/actions';

type Order = { id: string; orderNumber: string; status: string; customer: { name: string } | null };

// Orders reaching QC are always CONFIRMED or IN_PRODUCTION — QC_PENDING is not a status this schema has.
const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-sky-50 text-sky-800',
  IN_PRODUCTION: 'bg-amber-50 text-amber-900',
};

export function QcScreen({ orders, canWrite }: { orders: Order[]; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [result, setResult] = useState<'PASS' | 'FAIL' | 'NA'>('PASS');
  const [parameterName, setParameterName] = useState('');
  const [defectType, setDefectType] = useState('');
  const [defectQty, setDefectQty] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');

  const filtered = search.trim()
    ? orders.filter(o => o.orderNumber.toLowerCase().includes(search.toLowerCase()) || (o.customer?.name ?? '').toLowerCase().includes(search.toLowerCase()) || o.status.toLowerCase().includes(search.toLowerCase()))
    : orders;

  const orderOptions: SelectOption[] = [
    { value: '', label: '— Select Order —' },
    ...orders.map((o) => ({ value: o.id, label: `${o.orderNumber} — ${o.customer?.name ?? ''}` })),
  ];
  const resultOptions: SelectOption[] = [
    { value: 'PASS', label: 'Pass' },
    { value: 'FAIL', label: 'Fail' },
    { value: 'NA', label: 'N/A' },
  ];

  const handleAdd = () => startTransition(async () => {
    await addQcCheckAction({
      orderId,
      result,
      parameterName: parameterName || undefined,
      defectType: defectType || undefined,
      defectQty: defectQty ? parseFloat(defectQty) : undefined,
      notes: notes || undefined,
    });
    setParameterName(''); setDefectType(''); setDefectQty(''); setNotes(''); setResult('PASS'); setOpen(false);
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Quality Control</h1>
        <div className="flex gap-2">
          <Link href="/mis/qc/grid">
            <Button variant="ghost">Hourly Grid →</Button>
          </Link>
          {canWrite && <Button onClick={() => setOpen(true)}>+ Add Check</Button>}
        </div>
      </div>

      <div>
        <input
          type="search"
          placeholder="Search orders…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-gray-400 text-sm">
          No active orders for QC.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {filtered.map((order) => (
            <div key={order.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50">
              <div className="flex items-center gap-4">
                <div>
                  <div className="font-medium text-gray-900 text-sm">{order.orderNumber}</div>
                  <div className="text-xs text-gray-500">{order.customer?.name ?? 'No customer'}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {order.status.replace(/_/g, ' ')}
                </span>
              </div>
              <Link href={`/mis/qc/${order.id}`}>
                <Button variant="ghost">View Checks →</Button>
              </Link>
            </div>
          ))}
        </div>
      )}

      <SlideOver open={open} onClose={() => setOpen(false)} title="Add QC Check">
        <div className="flex flex-col gap-4 p-4">
          <Select label="Order" value={orderId} options={orderOptions} onChange={setOrderId} />
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
            <Button onClick={handleAdd} disabled={isPending || !orderId}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
