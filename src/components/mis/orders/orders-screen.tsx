'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { Pagination, HiddenParams } from '@/components/mis/kit/pagination';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input, DateInput, NumberInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { formatOrderQuantity, ORDER_UNIT_LABEL, ORDER_UNITS } from '@/lib/mis/order-quantity';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { saveOrderAction, updateOrderStatusAction } from '@/app/(mis)/mis/orders/actions';
import { useToast } from '@/components/ui/toast';
import { OrderStatusActions } from '@/components/mis/orders/order-status-actions';
import type { CloseGate } from '@/lib/mis/order-transitions';

type Order = {
  id: string; orderNumber: string; status: string; description: string | null; deliveryDate: Date | null; createdAt: Date; customer: { id: string; name: string } | null;
  /** R2-264 / R2-265: null on orders made before the columns existed. */
  quantity?: number | string | null; unit?: string | null; customerPoRef?: string | null;
};
type Customer = { id: string; name: string };
type Props = { orders: Order[]; customers: Customer[]; canWrite: boolean; initialCustomerId?: string; gatesByOrder?: Record<string, CloseGate[]>; canOverride?: boolean; canStartWithoutBom?: boolean; // R2-267
  /** R2-83: the server-side page — total matching rows, the page number, and the URL params kept in the page links. */
  paging?: { total: number; page: number; params: Record<string, string | undefined> }; };

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'DRAFT': return 'neutral';
    case 'CONFIRMED': return 'info';
    case 'IN_PRODUCTION': return 'warning';
    case 'COMPLETED': case 'DELIVERED': return 'good';
    case 'CANCELLED': return 'critical';
    default: return 'neutral';
  }
}

export function OrdersScreen({ orders, customers, canWrite, initialCustomerId, gatesByOrder = {}, canOverride = false, canStartWithoutBom = false, paging }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<string>('PIECE');
  const [customerPoRef, setCustomerPoRef] = useState('');
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const openAdd = () => { setEditing(null); setCustomerId(initialCustomerId ?? ''); setDescription(''); setDeliveryDate(''); setNotes(''); setQuantity(''); setUnit('PIECE'); setCustomerPoRef(''); setOpen(true); };
  const openEdit = (o: Order) => {
    setEditing(o);
    setCustomerId(o.customer?.id ?? '');
    setDescription(o.description ?? '');
    setDeliveryDate(o.deliveryDate ? new Date(o.deliveryDate).toISOString().split('T')[0] : '');
    setNotes('');
    setQuantity(o.quantity == null ? '' : String(Number(o.quantity)));
    setUnit(o.unit ?? 'PIECE');
    setCustomerPoRef(o.customerPoRef ?? '');
    setOpen(true);
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        const res = await saveOrderAction(editing?.id ?? null, {
          customerId: customerId || null, description: description || null, deliveryDate: deliveryDate || null, notes: notes || null,
          quantity: quantity.trim() === '' ? null : Number(quantity), unit, customerPoRef: customerPoRef || null,
        });
        if (!res.ok) { toast('error', res.detail); return; }
        setOpen(false);
      } catch { toast('error', 'That did not save. Try again.'); }
    });
  };

  const search = paging?.params.q ?? '';
  const filtered = orders;

  function downloadCsv() {
    const headers = ['Order #', 'Customer', 'Customer PO #', 'Description', 'Quantity', 'Status', 'Delivery Date', 'Created'];
    const rows = orders.map(o => [
      o.orderNumber,
      o.customer?.name ?? '',
      o.customerPoRef ?? '',
      o.description ?? '',
      formatOrderQuantity(o.quantity, o.unit) ?? '',
      o.status,
      o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('en-IN') : '',
      new Date(o.createdAt).toLocaleDateString('en-IN'),
    ]);
    const lines = [headers, ...rows].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const columns: Column<Order>[] = [
    { key: 'orderNumber', header: 'Order #', render: (r) => <span className="font-mono text-sm">{r.orderNumber}</span> },
    { key: 'customer', header: 'Customer', render: (r) => r.customer?.name ?? '—' },
    { key: 'description', header: 'Description', render: (r) => r.description ?? '—' },
    { key: 'quantity', header: 'Quantity', render: (r) => <span className="font-mono text-sm">{formatOrderQuantity(r.quantity, r.unit) ?? '—'}</span> }, // R2-264
    { key: 'customerPoRef', header: 'Customer PO #', render: (r) => <span className="font-mono text-sm">{r.customerPoRef ?? '—'}</span> }, // R2-265
    { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={statusTone(r.status)}>{r.status.replace(/_/g, ' ')}</StatusBadge> },
    { key: 'deliveryDate', header: 'Delivery', render: (r) => r.deliveryDate ? new Date(r.deliveryDate).toLocaleDateString('en-IN') : '—' },
    { key: 'createdAt', header: 'Created', render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN') },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href={`/mis/orders/${r.id}`} className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-indigo-700 hover:underline">View</Link>
        {canWrite && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
        {canWrite && r.status === 'DRAFT' && (
          <Button variant="ghost" onClick={() => startTransition(async () => {
            try {
              const res = await updateOrderStatusAction(r.id, 'CONFIRMED');
              if (!res.ok) toast('error', res.detail);
            } catch { toast('error', 'That did not save. Try again.'); }
          })}>Confirm</Button>
        )}
        {canWrite && r.status !== 'DRAFT' && (
          <OrderStatusActions orderId={r.id} orderNumber={r.orderNumber} status={r.status} gates={gatesByOrder[r.id] ?? []} canOverride={canOverride} canStartWithoutBom={canStartWithoutBom} override={null} />
        )}
      </div>
    )},
  ];

  return (
    <div className="mx-auto max-w-5xl flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Orders</h1>
        {canWrite && <Button onClick={openAdd}>+ New Order</Button>}
      </div>
      <form method="get" className="flex items-center gap-3">
        {paging && <HiddenParams params={paging.params} />}
        <input
          type="search"
          placeholder="Search orders…"
          name="q"
          defaultValue={search}
          className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <Button type="submit" variant="secondary">Search</Button>
        <Button type="button" variant="ghost" onClick={downloadCsv}>↓ CSV</Button>
      </form>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} emptyTitle="No orders yet" emptyBody="Create an order for a customer." />
      {paging && <Pagination basePath="/mis/orders" params={paging.params} page={paging.page} total={paging.total} />}
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Order' : 'New Order'}>
        <div className="flex flex-col gap-4 p-4">
          <Select
            label="Customer"
            value={customerId}
            onChange={setCustomerId}
            options={[{ value: '', label: '— No customer —' }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
          />
          <Input label="Description" value={description} onChange={e => setDescription(e.target.value)} />
          {/* R2-264: the finished-goods target, mandatory; R2-265: the customer's own PO number, optional. */}
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="Quantity" min={0} step="any" value={quantity} onChange={e => setQuantity(e.target.value)} />
            <Select label="Unit" value={unit} onChange={setUnit} options={ORDER_UNITS.map((u) => ({ value: u, label: ORDER_UNIT_LABEL[u] }))} />
          </div>
          <Input label="Customer PO # (optional)" value={customerPoRef} onChange={e => setCustomerPoRef(e.target.value)} />
          <DateInput label="Delivery Date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
          <Input label="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
