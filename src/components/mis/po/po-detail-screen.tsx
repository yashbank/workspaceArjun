'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { Card, CardRow } from '@/components/mis/kit/card';
import { addPoItemAction, removePoItemAction, submitPoAction, approvePoAction, cancelPoAction } from '@/app/(mis)/mis/po/actions';
import { poPurpose, poPurposeLabel } from '@/lib/mis/po-purpose';
import type { PoReconciliation } from '@/server/mis/supplier-invoice';

type CatalogItem = { id: string; name: string; unit: string };
type FormattedPoItem = {
  id: string; description: string; quantity: number; receivedQuantity: number; item: { id: string; name: string; unit: string } | null;
  // Money (D24): present only when the server sent it, i.e. for the Owner.
  ratePerUnit?: number; rateFormatted?: string; totalFormatted?: string;
};
type Po = {
  id: string; poNumber: string; status: string; bomRef: string | null; notes: string | null;
  supplier: { id: string; name: string; phone: string | null } | null;
  grns: { id: string; grnNumber: string; status: string; createdAt: Date }[];
};
type Props = { po: Po; formattedItems: FormattedPoItem[]; total: string | null; catalogItems: CatalogItem[]; canWrite: boolean; canApprove: boolean; /** V2 Epic 1 — PO ↔ GRN ↔ invoice; null until a GRN exists. */ reconciliation?: PoReconciliation | null };

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'DRAFT': return 'neutral';
    case 'PENDING_APPROVAL': return 'warning';
    case 'APPROVED': return 'good';
    case 'RECEIVING': case 'PARTIAL': return 'info';
    case 'COMPLETE': return 'good';
    case 'CANCELLED': return 'critical';
    default: return 'neutral';
  }
}

export function PoDetailScreen({ po, formattedItems, total, catalogItems, canWrite, canApprove, reconciliation = null }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [itemId, setItemId] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [ratePerUnit, setRatePerUnit] = useState('0');
  const [isPending, startTransition] = useTransition();

  const handleAddItem = () => {
    if (!description) return;
    startTransition(async () => {
      await addPoItemAction(po.id, { itemId: itemId || null, description, quantity: parseFloat(quantity) || 1, ratePerUnit: parseFloat(ratePerUnit) || 0 });
      setItemId(''); setDescription(''); setQuantity('1'); setRatePerUnit('0');
      setAddOpen(false);
    });
  };

  // The Rate and Total columns exist only when the money does — the Owner's view, not a hidden one.
  const seesMoney = total !== null;
  const columns: Column<FormattedPoItem>[] = [
    { key: 'description', header: 'Description', render: (r) => <div><div>{r.description}</div>{r.item && <div className="text-xs text-slate-500">{r.item.name}</div>}</div> },
    { key: 'quantity', header: 'Qty', render: (r) => r.quantity },
    ...(seesMoney ? [
      { key: 'rate', header: 'Rate', render: (r: FormattedPoItem) => r.rateFormatted ?? '' },
      { key: 'total', header: 'Total', render: (r: FormattedPoItem) => r.totalFormatted ?? '' },
    ] : []),
    { key: 'received', header: 'Received', render: (r) => r.receivedQuantity },
    { key: 'remaining', header: 'Remaining', render: (r) => (
      <span className={r.quantity - r.receivedQuantity > 0 ? 'text-amber-600' : 'text-slate-500'}>{r.quantity - r.receivedQuantity}</span>
    )},
    { key: 'actions', header: '', render: (r) => (
      po.status === 'DRAFT' && canWrite
        ? <Button variant="ghost" onClick={() => startTransition(async () => { await removePoItemAction(r.id, po.id); })}>Remove</Button>
        : null
    )},
  ];

  const isDraft = po.status === 'DRAFT';
  const isPendingApproval = po.status === 'PENDING_APPROVAL';

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{po.poNumber}</h1>
            <StatusBadge tone={statusTone(po.status)}>{po.status.replace(/_/g, ' ')}</StatusBadge>
          </div>
          <Link href="/mis/po" className="text-sm text-slate-500 hover:underline">← Back to POs</Link>
          <Link href={`/mis/print/po/${po.id}`} target="_blank" className="text-sm text-blue-600 hover:underline ml-4">🖨 Print PO</Link>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {isDraft && canWrite && <Button onClick={() => startTransition(async () => { await submitPoAction(po.id); })} disabled={isPending}>Submit for Approval</Button>}
          {isPendingApproval && canApprove && <Button onClick={() => startTransition(async () => { await approvePoAction(po.id); })} disabled={isPending}>Approve</Button>}
          {(isDraft || isPendingApproval) && canWrite && <Button variant="ghost" onClick={() => startTransition(async () => { await cancelPoAction(po.id); })} disabled={isPending}>Cancel</Button>}
        </div>
      </div>

      <Card>
        <CardRow label="Supplier" value={po.supplier?.name ?? '—'} />
        {po.supplier?.phone && <CardRow label="Supplier Phone" value={po.supplier.phone} />}
        <CardRow label="Purpose" value={poPurposeLabel(poPurpose(po))} />
        {po.bomRef && <CardRow label="BOM Ref" value={po.bomRef} />}
        {po.notes && <CardRow label="Notes" value={po.notes} />}
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Line Items</h2>
          {isDraft && canWrite && <Button onClick={() => setAddOpen(true)}>+ Add Item</Button>}
        </div>
        {formattedItems.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">No items added yet.</p>
        ) : (
          <>
            <DataTable columns={columns} rows={formattedItems} rowKey={(r) => r.id} emptyTitle="No items" />
            {seesMoney && <div className="flex justify-end text-sm font-semibold text-slate-800 pr-4">Total: {total}</div>}
          </>
        )}
      </div>

      {po.grns.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-slate-800">GRNs</h2>
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
            {po.grns.map((grn) => (
              <div key={grn.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="font-mono text-sm">{grn.grnNumber}</span>
                  <span className="ml-2 text-xs text-slate-500">{new Date(grn.createdAt).toLocaleDateString('en-IN')}</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge tone={grn.status === 'CONFIRMED' ? 'good' : 'neutral'}>{grn.status}</StatusBadge>
                  <Link href={`/mis/grn/${grn.id}`} className="text-sm text-blue-600 hover:underline">View</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {reconciliation && (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-slate-800">3-way match · PO ↔ GRN ↔ Invoice</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2">Line</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Damaged</th><th className="px-3 py-2 text-right">Short</th><th className="px-3 py-2 text-right">Outstanding</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reconciliation.lines.map((l) => (
                  <tr key={l.poItemId}>
                    <td className="px-3 py-2">{l.description}</td>
                    <td className="px-3 py-2 text-right">{l.ordered}</td>
                    <td className="px-3 py-2 text-right">{l.received}</td>
                    <td className={`px-3 py-2 text-right ${l.damaged > 0 ? 'text-amber-700' : ''}`}>{l.damaged}</td>
                    <td className={`px-3 py-2 text-right ${l.short > 0 ? 'text-red-700' : ''}`}>{l.short}</td>
                    <td className={`px-3 py-2 text-right ${l.outstanding > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{l.outstanding}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{reconciliation.totals.ordered}</td>
                  <td className="px-3 py-2 text-right">{reconciliation.totals.received}</td>
                  <td className="px-3 py-2 text-right">{reconciliation.totals.damaged}</td>
                  <td className="px-3 py-2 text-right">{reconciliation.totals.short}</td>
                  <td className="px-3 py-2 text-right">{reconciliation.totals.outstanding}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="text-sm text-slate-600">
            {reconciliation.invoices.length === 0
              ? 'No supplier invoice recorded yet — enter it on the GRN before confirming.'
              : <>Invoices: {reconciliation.invoices.map((i) => `${i.invoiceNo}${i.grnNumber ? ` (${i.grnNumber})` : ''}`).join(', ')}</>}
          </div>
          {reconciliation.money === undefined && reconciliation.unpricedInvoices > 0 && reconciliation.invoices.length === reconciliation.unpricedInvoices && (
            <p className="text-sm text-amber-700">Invoice amount not entered yet — the Owner adds it on the GRN to see the rupee match.</p>
          )}
          {reconciliation.money && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([['PO value', reconciliation.money.poValue], ['Received value', reconciliation.money.receivedValue], ['Invoiced', reconciliation.money.invoiced], ['Variance', reconciliation.money.variance]] as const).map(([label, value]) => (
                <div key={label} className={`rounded-lg border p-3 ${label === 'Variance' && reconciliation.money!.varianceRaw !== 0 ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}>
                  <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                  <div className="mt-1 font-semibold text-slate-900">{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <SlideOver open={addOpen} onClose={() => setAddOpen(false)} title="Add Line Item">
        <div className="flex flex-col gap-4 p-4">
          <Select
            label="Item (optional)"
            value={itemId}
            onChange={(v) => {
              const item = catalogItems.find(i => i.id === v);
              setItemId(v);
              if (item) setDescription(item.name);
            }}
            options={[{ value: '', label: '— None —' }, ...catalogItems.map(i => ({ value: i.id, label: i.name }))]}
          />
          <Input label="Description" value={description} onChange={e => setDescription(e.target.value)} required />
          <NumberInput label="Quantity" value={quantity} onChange={e => setQuantity(e.target.value)} />
          <NumberInput label="Rate per Unit (₹)" value={ratePerUnit} onChange={e => setRatePerUnit(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAddItem} disabled={isPending || !description}>{isPending ? 'Adding…' : 'Add Item'}</Button>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
