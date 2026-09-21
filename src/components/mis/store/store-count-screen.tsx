'use client';
import { useState, useTransition } from 'react';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { Button } from '@/components/mis/kit/button';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { NumberInput, Input } from '@/components/mis/kit/input';
import { physicalCountAction } from '@/app/(mis)/mis/store/actions';

type ItemOption = {
  id: string;
  code: string;
  sku: string | null;
  name: string;
  unit: string;
  stockBalance: number;
};

type CountRow = {
  id: string;
  itemId: string;
  itemName: string;
  countDate: string;
  physicalQty: number;
  systemQty: number;
  discrepancy: number;
  notes: string | null;
  createdAt: Date;
};

type Props = {
  items: ItemOption[];
  counts: CountRow[];
  canCount: boolean;
};

export function StoreCountScreen({ items, counts, canCount }: Props) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [physQty, setPhysQty] = useState('');
  const [countDate, setCountDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const filtered = counts.filter((c) => {
    const q = search.trim().toLowerCase();
    return !q || c.itemName.toLowerCase().includes(q);
  });

  const selectedItem = items.find((i) => i.id === selectedItemId);

  const handleSubmit = () => {
    if (!selectedItemId || !physQty || !countDate) {
      setError('Select an item, enter count, and pick a date');
      return;
    }
    const qty = parseFloat(physQty);
    if (isNaN(qty) || qty < 0) {
      setError('Enter a valid non-negative quantity');
      return;
    }
    setError('');
    startTransition(async () => {
      try {
        await physicalCountAction({
          itemId: selectedItemId,
          physicalQty: qty,
          countDate,
          notes: notes || undefined,
        });
        setSuccess(`Physical count recorded for ${selectedItem?.name ?? ''}`);
        setOpen(false);
        setSelectedItemId('');
        setPhysQty('');
        setNotes('');
      } catch (e: any) {
        setError(e.message ?? 'Count failed');
      }
    });
  };

  const columns: Column<CountRow>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (r) => <span className="font-medium text-slate-900">{r.itemName}</span>,
    },
    {
      key: 'date',
      header: 'Count Date',
      render: (r) => (
        <span className="text-sm text-slate-600">
          {new Date(r.countDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
    {
      key: 'physical',
      header: 'Physical Qty',
      render: (r) => <span className="font-mono">{r.physicalQty.toFixed(2)}</span>,
    },
    {
      key: 'system',
      header: 'System Qty',
      render: (r) => <span className="font-mono text-slate-500">{r.systemQty.toFixed(2)}</span>,
    },
    {
      key: 'discrepancy',
      header: 'Discrepancy',
      render: (r) => {
        const d = r.discrepancy;
        const tone = d === 0 ? 'good' : d > 0 ? 'warning' : 'critical';
        return (
          <StatusBadge tone={tone}>
            {d >= 0 ? '+' : ''}{d.toFixed(2)}
          </StatusBadge>
        );
      },
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (r) => <span className="text-sm text-slate-500">{r.notes ?? '—'}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Physical Count</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Discrepancy is visible to owner / admin only.
          </p>
        </div>
        {canCount && (
          <Button onClick={() => { setOpen(true); setError(''); }}>
            + New Count
          </Button>
        )}
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded-lg flex justify-between">
          {success}
          <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700">&#x2715;</button>
        </div>
      )}

      <input
        type="search"
        placeholder="Search by item name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        emptyTitle="No physical counts"
        emptyBody="Use the + New Count button to record your first physical count."
      />

      <SlideOver open={open} onClose={() => setOpen(false)} title="Record Physical Count">
        <div className="flex flex-col gap-4 p-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Item</label>
            <select
              value={selectedItemId}
              onChange={(e) => {
                setSelectedItemId(e.target.value);
                setPhysQty('');
              }}
              className="w-full min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">Select item…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.sku ? `[${i.sku}] ` : ''}{i.name} ({i.code})
                </option>
              ))}
            </select>
          </div>

          {selectedItem && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm">
              <div className="text-slate-500">System Balance</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {selectedItem.stockBalance.toFixed(2)} {selectedItem.unit}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Count Date</label>
            <input
              type="date"
              value={countDate}
              onChange={(e) => setCountDate(e.target.value)}
              className="w-full min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <NumberInput
            label={`Physical Count${selectedItem ? ` (${selectedItem.unit})` : ''}`}
            value={physQty}
            onChange={(e) => setPhysQty(e.target.value)}
            placeholder="Actual counted quantity"
          />

          {selectedItem && physQty && !isNaN(parseFloat(physQty)) && (
            <div className="bg-slate-50 rounded-lg p-3 text-sm flex gap-6">
              <div>
                <div className="text-slate-500 text-xs">Expected discrepancy</div>
                <div className={`font-mono font-bold mt-0.5 ${parseFloat(physQty) - selectedItem.stockBalance >= 0 ? 'text-amber-700' : 'text-red-700'}`}>
                  {(parseFloat(physQty) - selectedItem.stockBalance >= 0 ? '+' : '')}
                  {(parseFloat(physQty) - selectedItem.stockBalance).toFixed(2)} {selectedItem.unit}
                </div>
              </div>
            </div>
          )}

          <Input
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Location, counter name, remarks…"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={isPending || !selectedItemId || !physQty}>
              {isPending ? 'Saving…' : 'Record Count'}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
