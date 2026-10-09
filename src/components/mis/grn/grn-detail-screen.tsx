'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { Card, CardRow } from '@/components/mis/kit/card';
import { DateInput, NumberInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { Input } from '@/components/mis/kit/input';
import { addGrnItemAction, confirmGrnAction, updateGrnHeaderAction } from '@/app/(mis)/mis/grn/actions';

type GrnItem = {
  id: string;
  receivedQty: { toNumber(): number } | number;
  type: string;
  forOrderRef: string | null;
  batchNo: string | null;
  dcQuantity?: number | null;
  damageQuantity?: number;
  shortQuantity?: number | null;
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
  supplierInvoiceNo?: string | null;
  invoiceDate?: Date | string | null;
  /** Money: present only for the Owner (the server strips it for everyone else). */
  supplierInvoiceAmount?: number | null;
  lrNumber?: string | null;
  vehicleNumber?: string | null;
  transporterName?: string | null;
  dcNumber?: string | null;
  po: { id: string; poNumber: string; supplier: { id: string; name: string } | null; items: PoItem[] } | null;
  items: GrnItem[];
};
type Props = { grn: Grn; canWrite: boolean; canSeeMoney?: boolean; /** Server-formatted (Owner only); null otherwise. */ invoiceAmountFormatted?: string | null };

const isoDate = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function toNum(v: { toNumber(): number } | number): number {
  return typeof v === 'number' ? v : v.toNumber();
}

export function GrnDetailScreen({ grn, canWrite, canSeeMoney = false, invoiceAmountFormatted = null }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedPoItemId, setSelectedPoItemId] = useState('');
  const [qty, setQty] = useState('');
  const [dcQty, setDcQty] = useState('');
  const [damageQty, setDamageQty] = useState('');
  const [itemError, setItemError] = useState<string | null>(null);
  const [header, setHeader] = useState({
    supplierInvoiceNo: grn.supplierInvoiceNo ?? '',
    invoiceDate: isoDate(grn.invoiceDate),
    supplierInvoiceAmount: grn.supplierInvoiceAmount != null ? String(grn.supplierInvoiceAmount) : '',
    lrNumber: grn.lrNumber ?? '',
    vehicleNumber: grn.vehicleNumber ?? '',
    transporterName: grn.transporterName ?? '',
    dcNumber: grn.dcNumber ?? '',
  });
  const [headerSaved, setHeaderSaved] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const setH = (k: keyof typeof header) => (e: React.ChangeEvent<HTMLInputElement>) => { setHeaderSaved(false); setHeader({ ...header, [k]: e.target.value }); };

  const handleSaveHeader = () => {
    setHeaderError(null);
    startTransition(async () => {
      try {
      await updateGrnHeaderAction(grn.id, {
        supplierInvoiceNo: header.supplierInvoiceNo || null,
        invoiceDate: header.invoiceDate || null,
        ...(canSeeMoney ? { supplierInvoiceAmount: header.supplierInvoiceAmount ? parseFloat(header.supplierInvoiceAmount) : null } : {}),
        lrNumber: header.lrNumber || null,
        vehicleNumber: header.vehicleNumber || null,
        transporterName: header.transporterName || null,
        dcNumber: header.dcNumber || null,
      });
      setHeaderSaved(true);
      } catch (e) {
        setHeaderError(e instanceof Error ? e.message : 'That did not save.');
      }
    });
  };
  const [type, setType] = useState('GENERAL');
  const [orderRef, setOrderRef] = useState('');
  const [batchNo, setBatchNo] = useState('');

  const isDraft = grn.status === 'DRAFT';
  const addedPoItemIds = new Set(grn.items.map(i => i.poItem.id));
  const availablePoItems = (grn.po?.items ?? []).filter(i => !addedPoItemIds.has(i.id));

  const handleAddItem = () => {
    if (!selectedPoItemId || !qty) return;
    setItemError(null);
    startTransition(async () => {
      try {
        await addGrnItemAction(grn.id, {
          poItemId: selectedPoItemId,
          receivedQty: parseFloat(qty),
          type: type as 'GENERAL' | 'FOR_ORDER',
          forOrderRef: orderRef || null,
          batchNo: batchNo || null,
          dcQuantity: dcQty ? parseFloat(dcQty) : null,
          damageQuantity: damageQty ? parseFloat(damageQty) : 0,
        });
        setSelectedPoItemId(''); setQty(''); setOrderRef(''); setBatchNo(''); setDcQty(''); setDamageQty('');
      } catch (e) {
        setItemError(e instanceof Error ? e.message : 'That did not save.');
      }
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
        {!isDraft && (
          <>
            {grn.supplierInvoiceNo && <CardRow label="Supplier Invoice" value={`${grn.supplierInvoiceNo}${grn.invoiceDate ? ` · ${new Date(grn.invoiceDate).toLocaleDateString('en-IN')}` : ''}`} />}
            {invoiceAmountFormatted && <CardRow label="Invoice Amount" value={invoiceAmountFormatted} />}
            {grn.dcNumber && <CardRow label="DC No" value={grn.dcNumber} />}
            {grn.lrNumber && <CardRow label="LR No" value={grn.lrNumber} />}
            {grn.vehicleNumber && <CardRow label="Vehicle" value={grn.vehicleNumber} />}
            {grn.transporterName && <CardRow label="Transporter" value={grn.transporterName} />}
          </>
        )}
      </Card>

      {isDraft && canWrite && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800">Delivery paperwork</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Supplier Invoice No" value={header.supplierInvoiceNo} onChange={setH('supplierInvoiceNo')} />
            <DateInput label="Invoice Date" value={header.invoiceDate} onChange={setH('invoiceDate')} />
            {canSeeMoney && <NumberInput label="Supplier Invoice Amount (₹)" value={header.supplierInvoiceAmount} onChange={setH('supplierInvoiceAmount')} />}
            <Input label="DC Number" value={header.dcNumber} onChange={setH('dcNumber')} />
            <Input label="LR Number" value={header.lrNumber} onChange={setH('lrNumber')} />
            <Input label="Vehicle Number" value={header.vehicleNumber} onChange={setH('vehicleNumber')} />
            <Input label="Transporter" value={header.transporterName} onChange={setH('transporterName')} />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleSaveHeader} disabled={isPending}>{isPending ? 'Saving…' : 'Save paperwork'}</Button>
            {headerSaved && <span className="text-sm text-green-700">Saved</span>}
            {headerError && <span role="alert" className="text-sm text-red-600">{headerError}</span>}
          </div>
        </div>
      )}

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
              {item.dcQuantity != null && <span>DC: {item.dcQuantity}</span>}
              {!!item.damageQuantity && <span className="text-amber-700">Damaged: {item.damageQuantity}</span>}
              {item.shortQuantity != null && item.shortQuantity > 0 && <span className="text-red-700">Short: {item.shortQuantity}</span>}
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
          <NumberInput label="Received Qty (good)" value={qty} onChange={e => setQty(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="DC Qty (challan)" value={dcQty} onChange={e => setDcQty(e.target.value)} />
            <NumberInput label="Damaged Qty" value={damageQty} onChange={e => setDamageQty(e.target.value)} />
          </div>
          {dcQty && <p className="text-xs text-slate-500">Short = {dcQty} − ({qty || 0} + {damageQty || 0}) = <strong>{Math.round(((parseFloat(dcQty) || 0) - (parseFloat(qty) || 0) - (parseFloat(damageQty) || 0)) * 100) / 100}</strong></p>}
          {itemError && <p className="text-sm text-red-600">{itemError}</p>}
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
