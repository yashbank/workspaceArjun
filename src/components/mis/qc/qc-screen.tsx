'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { Combobox } from '@/components/ui/combobox';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Pagination } from '@/components/mis/kit/pagination';
import { ListToolbar } from '@/components/mis/kit/list-toolbar';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { IconAction } from '@/components/mis/kit/icon-action';
import { ListKpiCards } from '@/components/mis/common/list-kpi-cards';
import { ClipboardCheck } from 'lucide-react';
import { addQcCheckAction } from '@/app/(mis)/mis/qc/actions';

type Order = { id: string; orderNumber: string; status: string; customer: { name: string } | null };
type DefectTypeOption = { id: string; code: string; name: string; severity: string };

// Orders reaching QC are always CONFIRMED or IN_PRODUCTION — QC_PENDING is not a status this schema has.
const statusTone = (st: string): BadgeTone => (st === 'CONFIRMED' ? 'info' : st === 'IN_PRODUCTION' ? 'warning' : 'neutral');

/** '' is the sentinel for "not in the master" — QC holds masters.read, not masters.write, so a
 * defect that is not yet classified must still be recordable, as free text (F-19/D14: "severity
 * comes from the master, never the person" — anything else stays honestly unclassified). */
const OTHER_DEFECT = '';

type Paging = { total: number; page: number; params: Record<string, string | undefined> };

export function QcScreen({ orders, pickerOrders = orders, canWrite, defectTypes, paging }: { orders: Order[]; pickerOrders?: Order[]; canWrite: boolean; defectTypes: DefectTypeOption[]; paging?: Paging }) {
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [result, setResult] = useState<'PASS' | 'FAIL' | 'NA'>('PASS');
  const [parameterName, setParameterName] = useState('');
  const [defectTypeCode, setDefectTypeCode] = useState(OTHER_DEFECT);
  const [defectTypeOther, setDefectTypeOther] = useState('');
  const [defectQty, setDefectQty] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // R2-393: the list query takes no status, so the filter narrows the rows already loaded on this page.
  const [statusFilter, setStatusFilter] = useState('');
  const filtered = statusFilter ? orders.filter((o) => o.status === statusFilter) : orders;
  const countStatus = (st: string) => orders.filter((o) => o.status === st).length;

  const columns: Column<Order>[] = [
    { key: 'orderNumber', header: 'Order #', render: (o) => <span className="font-mono text-sm">{o.orderNumber}</span> },
    { key: 'customer', header: 'Customer', render: (o) => o.customer?.name ?? 'No customer' },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge tone={statusTone(o.status)}>{o.status.replace(/_/g, ' ')}</StatusBadge> },
    { key: 'actions', header: '', render: (o) => <div className="flex justify-end"><IconAction label="View Checks →" href={`/mis/qc/${o.id}`} icon={<ClipboardCheck aria-hidden="true" className="size-5" />} /></div> },
  ];

  const orderOptions: SelectOption[] = [
    { value: '', label: '— Select Order —' },
    ...pickerOrders.map((o) => ({ value: o.id, label: `${o.orderNumber} — ${o.customer?.name ?? ''}` })),
  ];
  const resultOptions: SelectOption[] = [
    { value: 'PASS', label: 'Pass' },
    { value: 'FAIL', label: 'Fail' },
    { value: 'NA', label: 'N/A' },
  ];
  const defectTypeOptions: SelectOption[] = [
    { value: OTHER_DEFECT, label: 'Not listed — describe below' },
    ...defectTypes.map((dt) => ({ value: dt.code, label: `${dt.name} (${dt.severity})` })),
  ];

  const handleAdd = () => startTransition(async () => {
    setError(null);
    const outcome = await addQcCheckAction({
      orderId,
      result,
      parameterName: parameterName || undefined,
      defectType: (defectTypeCode || defectTypeOther.trim()) || undefined,
      defectQty: defectQty ? parseFloat(defectQty) : undefined,
      notes: notes || undefined,
    });
    if (!outcome.ok) { setError(outcome.detail); return; }
    setParameterName(''); setDefectTypeCode(OTHER_DEFECT); setDefectTypeOther(''); setDefectQty(''); setNotes(''); setResult('PASS'); setOpen(false);
  });

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Quality Control</h1>
        <div className="flex gap-2">
          <Link href="/mis/qc/grid">
            <Button variant="ghost">Hourly Grid →</Button>
          </Link>
          {canWrite && <Button onClick={() => setOpen(true)}>+ Add Check</Button>}
        </div>
      </div>

      <ListKpiCards ariaLabel="Quality summary" items={[
        { label: 'Orders in QC on this page', value: orders.length },
        { label: 'Confirmed', value: countStatus('CONFIRMED') },
        { label: 'In production', value: countStatus('IN_PRODUCTION') },
        { label: 'Orders shown', value: filtered.length },
      ]} />

      <ListToolbar basePath="/mis/qc" params={paging?.params ?? {}} searchLabel="Search orders…" showViewToggle={false}>
        {() => (
          <Select
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[{ value: '', label: 'All statuses' }, ...['CONFIRMED', 'IN_PRODUCTION'].map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))]}
          />
        )}
      </ListToolbar>

      <DataTable columns={columns} rows={filtered} rowKey={(o) => o.id} emptyTitle="No active orders for QC." />
      {paging && <Pagination basePath="/mis/qc" params={paging.params} page={paging.page} total={paging.total} />}

      <SlideOver open={open} onClose={() => setOpen(false)} title="Add QC Check">
        <div className="flex flex-col gap-4 p-4">
          <Combobox label="Order" value={orderId} options={orderOptions} onChange={setOrderId} />
          <Select label="Result" value={result} options={resultOptions} onChange={(v) => setResult(v as 'PASS' | 'FAIL' | 'NA')} />
          <Input label="Parameter Name" value={parameterName} onChange={(e) => setParameterName(e.target.value)} />
          {result === 'FAIL' && (
            <>
              <Select label="Defect Type" value={defectTypeCode} options={defectTypeOptions} onChange={setDefectTypeCode} />
              {defectTypeCode === OTHER_DEFECT && (
                <Input label="Describe the defect" value={defectTypeOther} onChange={(e) => setDefectTypeOther(e.target.value)} />
              )}
              <NumberInput label="Defect Qty" value={defectQty} onChange={(e) => setDefectQty(e.target.value)} />
            </>
          )}
          <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAdd} disabled={isPending || !orderId}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
