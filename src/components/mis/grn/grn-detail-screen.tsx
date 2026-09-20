'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { Card, CardRow } from '@/components/mis/kit/card';
import { NumberInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { Input } from '@/components/mis/kit/input';
import { addGrnItemAction, confirmGrnAction } from '@/app/(mis)/mis/grn/actions';

type GrnItem = {
  id: string;
  receivedQty: { toNumber(): number } | number;
  type: string;
  forOrderRef: string | null;
  batchNo: string | null;
  poItem: { id: string; description: string; quantity: { toNumber(): number } | number; item: { id: string; name: string } | null };
};
type PoItem = {
  id: string;
  description: string;
  quantity: { toNumber(): number } | number;
  item: { id: string; name: string } | null;
};
type Grn = {
  id: string;
  grnNumber: string;
  status: string;
  notes: string | null;
  po: { id: string; poNumber: string; supplier: { id: string; name: string } | null; items: PoItem[] } | null;
  items: GrnItem[];
};
type Props = { grn: Grn; canWrite: boolean };

function toNum(v: { toNumber(): number } | number): number {
  return typeof v === 'number' ? v : v.toNumber();
}

export function GrnDetailScreen({ grn, canWrite }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedPoItemId, setSelectedPoItemId] = useState('');
  const [qty, setQty] = useState('');
  const [type, setType] = useState('GENERAL');
  const [orderRef, setOrderRef] = useState('');
  const [batchNo, setBatchNo] = useState('');

  const isDraft = grn.status === 'DRAFT';
  const addedPoItemIds = new Set(grn.items.map(i => i.poItem.id));
  const availablePoItems = (grn.po?.items ?? []).filter(i => !addedPoItemIds.has(i.id));

  const handleAddItem = () => {
    if (!selectedPoItemId || !qty) return;
    startTransition(async () => {
      await addGrnItemAction(grn.id, {
        poItemId: selectedPoItemId,
        receivedQty: parseFloat(qty),
        type: type as 'GENERAL' | 'FOR_ORDER',
        forOrderRef: orderRef || null,
        batchNo: batchNo || null,
      });
      setSelectedPoItemId(''); setQty(''); setOrderRef(''); setBatchNo('');
    });
  };

  const handleConfirm = () => {
    if (!confirm('Confirming this GRN will update inventory and cannot be undone. Proceed?')) return;
    startTransition(async () => { await confirmGrnAction(grn.id); });
  };

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{grn.grnNumber}</h1>
            <StatusBadge tone={grn.status === 'CONFIRMED' ? 'good' : 'neutral'}>{grn.status}</StatusBadge>
          </div>
          <Link href="/mis/grn" className="text-sm text-slate-500 hover:underline">← Back to GRNs</Link>
          <a href={`/mis/print/grn/${grn.id}`} target="_blank" className="text-sm text-blue-600 hover:underline ml-4">🖨 Print GRN</a>
        </div>
        {isDraft && canWrite && grn.items.length > 0 && (
          <Button onClick={handleConfirm} disabled={isPending}>Confirm GRN</Button>
        )}
      </div>

      <Card>
        {grn.po && <CardRow label="PO #" value={<Link href={`/mis/po/${grn.po.id}`} className="text-blue-600 hover:underline">{grn.po.poNumber}</Link>} />}
        {grn.po?.supplier && <CardRow label="Supplier" value={grn.po.supplier.name} />}
        {grn.notes && <CardRow label="Notes" value={grn.notes} />}
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold text-slate-800">Items Received</h2>
        {grn.items.length === 0 && <p className="text-sm text-slate-500">No items added yet.</p>}
        {grn.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-slate-800">{item.poItem.description}</div>
                {item.poItem.item && <div className="text-xs text-slate-500">{item.poItem.item.name}</div>}
              </div>
              <StatusBadge tone={item.type === 'FOR_ORDER' ? 'info' : 'neutral'}>{item.type === 'FOR_ORDER' ? 'For Order' : 'General'}</StatusBadge>
            </div>
            <div className="flex gap-6 text-sm text-slate-600">
              <span>Received: <strong>{toNum(item.receivedQty)}</strong></span>
              <span>PO Qty: {toNum(item.poItem.quantity)}</span>
              {item.batchNo && <span>Batch: {item.batchNo}</span>}
              {item.forOrderRef && <span>Order Ref: {item.forOrderRef}</span>}
            </div>
          </div>
        ))}
      </div>

      {isDraft && canWrite && availablePoItems.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800">Add Item</h2>
          <Select
            label="PO Line Item"
            value={selectedPoItemId}
            onChange={setSelectedPoItemId}
            options={[{ value: '', label: '— Select item —' }, ...availablePoItems.map(i => ({ value: i.id, label: `${i.description} (Ordered: ${toNum(i.quantity)})` }))]}
          />
          <NumberInput label="Received Qty" value={qty} onChange={e => setQty(e.target.value)} />
          <Select
            label="Type"
            value={type}
            onChange={setType}
            options={[{ value: 'GENERAL', label: 'General Stock' }, { value: 'FOR_ORDER', label: 'For Specific Order' }]}
          />
          {type === 'FOR_ORDER' && (
            <Input label="Order Reference" value={orderRef} onChange={e => setOrderRef(e.target.value)} />
          )}
          <Input label="Batch No" value={batchNo} onChange={e => setBatchNo(e.target.value)} />
          <div>
            <Button onClick={handleAddItem} disabled={isPending || !selectedPoItemId || !qty}>{isPending ? 'Adding…' : 'Add Item'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
