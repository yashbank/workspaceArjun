'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Input, DateInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';
import { saveOrderAction, updateOrderStatusAction } from '@/app/(mis)/mis/orders/actions';

type Order = { id: string; orderNumber: string; status: string; description: string | null; deliveryDate: Date | null; createdAt: Date; customer: { id: string; name: string } | null };
type Customer = { id: string; name: string };
type Props = { orders: Order[]; customers: Customer[]; canWrite: boolean; initialCustomerId?: string };

function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'DRAFT': return 'neutral';
    case 'CONFIRMED': return 'info';
    case 'IN_PRODUCTION': return 'warning';
    case 'COMPLETE': return 'good';
    case 'CANCELLED': return 'critical';
    default: return 'neutral';
  }
}

export function OrdersScreen({ orders, customers, canWrite, initialCustomerId }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [description, setDescription] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  const openAdd = () => { setEditing(null); setCustomerId(initialCustomerId ?? ''); setDescription(''); setDeliveryDate(''); setNotes(''); setOpen(true); };
  const openEdit = (o: Order) => {
    setEditing(o);
    setCustomerId(o.customer?.id ?? '');
    setDescription(o.description ?? '');
    setDeliveryDate(o.deliveryDate ? new Date(o.deliveryDate).toISOString().split('T')[0] : '');
    setNotes('');
    setOpen(true);
  };

  const handleSave = () => {
    startTransition(async () => {
      await saveOrderAction(editing?.id ?? null, { customerId: customerId || null, description: description || null, deliveryDate: deliveryDate || null, notes: notes || null });
      setOpen(false);
    });
  };

  const [search, setSearch] = useState('');
  const filtered = search.trim()
    ? orders.filter(o => o.orderNumber.toLowerCase().includes(search.toLowerCase()) || (o.customer?.name ?? '').toLowerCase().includes(search.toLowerCase()) || (o.description ?? '').toLowerCase().includes(search.toLowerCase()))
    : orders;

  function downloadCsv() {
    const headers = ['Order #', 'Customer', 'Description', 'Status', 'Delivery Date', 'Created'];
    const rows = orders.map(o => [
      o.orderNumber,
      o.customer?.name ?? '',
      o.description ?? '',
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
    { key: 'status', header: 'Status', render: (r) => <StatusBadge tone={statusTone(r.status)}>{r.status.replace(/_/g, ' ')}</StatusBadge> },
    { key: 'deliveryDate', header: 'Delivery', render: (r) => r.deliveryDate ? new Date(r.deliveryDate).toLocaleDateString('en-IN') : '—' },
    { key: 'createdAt', header: 'Created', render: (r) => new Date(r.createdAt).toLocaleDateString('en-IN') },
    { key: 'actions', header: '', render: (r) => (
      <div className="flex gap-2 justify-end">
        <Link href={`/mis/orders/${r.id}`} className="px-3 py-1.5 text-sm text-blue-600 hover:underline">View</Link>
        {canWrite && <Button variant="ghost" onClick={() => openEdit(r)}>Edit</Button>}
        {canWrite && r.status === 'DRAFT' && (
          <Button variant="ghost" onClick={() => startTransition(async () => { await updateOrderStatusAction(r.id, 'CONFIRMED'); })}>Confirm</Button>
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
      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Search orders…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
        <Button variant="ghost" onClick={downloadCsv}>↓ CSV</Button>
      </div>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} emptyTitle="No orders yet" emptyBody="Create an order for a customer." />
      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Order' : 'New Order'}>
        <div className="flex flex-col gap-4 p-4">
          <Select
            label="Customer"
            value={customerId}
            onChange={setCustomerId}
            options={[{ value: '', label: '— No customer —' }, ...customers.map(c => ({ value: c.id, label: c.name }))]}
          />
          <Input label="Description" value={description} onChange={e => setDescription(e.target.value)} />
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
