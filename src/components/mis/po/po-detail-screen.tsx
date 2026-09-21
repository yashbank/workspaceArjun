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
type Props = { po: Po; formattedItems: FormattedPoItem[]; total: string | null; catalogItems: CatalogItem[]; canWrite: boolean; canApprove: boolean };

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

export function PoDetailScreen({ po, formattedItems, total, catalogItems, canWrite, canApprove }: Props) {
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
