'use client';
import { useState, useMemo, useTransition } from 'react';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { Button } from '@/components/mis/kit/button';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { Select } from '@/components/mis/kit/select';
import { Combobox } from '@/components/ui/combobox';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { storeInAction, storeOutAction } from '@/app/(mis)/mis/store/actions';
import { unwrap } from '@/lib/mis/action-result';
import type { StoreTxnRow, StoreItemRow } from '@/server/mis/store';
import { Pagination, HiddenParams } from '@/components/mis/kit/pagination';
import { fmtDate as fmtFactoryDate, fmtTime as fmtFactoryTime } from '@/lib/mis/client-dates';

type IssueTargets = {
  orders: { id: string; orderNumber: string; customerName: string | null }[];
  departments: { id: string; name: string }[];
};

type Props = {
  txns: StoreTxnRow[];
  items: StoreItemRow[];
  canWrite: boolean;
  targets?: IssueTargets;
  /** R2-83: the server-side page — total matching rows, the page number, and the URL filters (kept in the page links). */
  paging?: { total: number; page: number; params: Record<string, string | undefined> };
};

function fmt(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return fmtFactoryDate(date, { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return fmtFactoryTime(date, { hour: '2-digit', minute: '2-digit' });
}

function downloadCsv(rows: StoreTxnRow[]) {
  const headers = ['Txn No.', 'Date', 'Time', 'Item Code', 'Item Name', 'SKU', 'Type', 'Quantity', 'Balance After', 'Over-Issue', 'Reference', 'Reason'];
  const data = rows.map((r) => [
    r.txnNumber,
    fmt(r.createdAt),
    fmtTime(r.createdAt),
    r.itemCode,
    r.itemName,
    r.sku ?? '',
    r.type,
    String(r.quantity),
    String(r.balanceQty),
    r.isOverIssue ? 'Yes' : 'No',
    r.referenceNo ?? '',
    r.reason ?? '',
  ]);
  const lines = [headers, ...data].map((row) =>
    row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','),
  );
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `store-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const emptyIn = { itemId: '', quantity: '', referenceNo: '', notes: '' };
const emptyOut = { itemId: '', quantity: '', referenceNo: '', orderId: '', departmentId: '' };

export function StoreTransactionsScreen({ txns, items, canWrite, targets = { orders: [], departments: [] }, paging }: Props) {
  const urlParams = paging?.params ?? {};
  const search = urlParams.q ?? '';
  const typeFilter = urlParams.type ?? '';
  const itemFilter = urlParams.itemId ?? '';
  const fromDate = urlParams.from ?? '';
  const toDate = urlParams.to ?? '';

  const [isPending, startTransition] = useTransition();
  const [inOpen, setInOpen] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [inForm, setInForm] = useState(emptyIn);
  const [outForm, setOutForm] = useState(emptyOut);
  const [inError, setInError] = useState<string | null>(null);
  const [outError, setOutError] = useState<string | null>(null);

  const itemOptions = useMemo(
    () => items.map((item) => ({ value: item.id, label: `${item.code} — ${item.name}` })),
    [items],
  );
  const selectedInItem = items.find((i) => i.id === inForm.itemId) ?? null;
  const selectedOutItem = items.find((i) => i.id === outForm.itemId) ?? null;

  const openIn = () => { setInForm(emptyIn); setInError(null); setInOpen(true); };
  const openOut = () => { setOutForm(emptyOut); setOutError(null); setOutOpen(true); };

  const submitIn = () => {
    const quantity = parseFloat(inForm.quantity);
    if (!inForm.itemId) { setInError('Select an item.'); return; }
    if (!inForm.quantity || Number.isNaN(quantity) || quantity <= 0) { setInError('Enter a quantity greater than 0.'); return; }
    setInError(null);
    startTransition(async () => {
      try {
        unwrap(await storeInAction({
          itemId: inForm.itemId,
          quantity,
          referenceNo: inForm.referenceNo.trim() || undefined,
          notes: inForm.notes.trim() || undefined,
        }));
        setInOpen(false);
        setInForm(emptyIn);
      } catch (e: unknown) {
        setInError(e instanceof Error ? e.message : 'Store IN failed.');
      }
    });
  };

  const submitOut = () => {
    const quantity = parseFloat(outForm.quantity);
    if (!outForm.itemId) { setOutError('Select an item.'); return; }
    if (!outForm.quantity || Number.isNaN(quantity) || quantity <= 0) { setOutError('Enter a quantity greater than 0.'); return; }
    if (!outForm.orderId && !outForm.departmentId) { setOutError('Pick an order or a department for this issue.'); return; }
    setOutError(null);
    startTransition(async () => {
      try {
        unwrap(await storeOutAction({
          itemId: outForm.itemId,
          quantity,
          referenceNo: outForm.referenceNo.trim() || undefined,
          orderId: outForm.orderId || null,
          departmentId: outForm.departmentId || null,
        }));
        setOutOpen(false);
        setOutForm(emptyOut);
      } catch (e: unknown) {
        setOutError(e instanceof Error ? e.message : 'Store OUT failed.');
      }
    });
  };

  // R2-83: the server already applied search / type / item / dates and the page; these are that page's rows.
  const filtered = txns;

  const totalIn = filtered.filter((r) => r.type === 'IN').reduce((s, r) => s + r.quantity, 0);
  const totalOut = filtered.filter((r) => r.type === 'OUT').reduce((s, r) => s + r.quantity, 0);

  const columns: Column<StoreTxnRow>[] = [
    {
      key: 'txnNumber',
      header: 'Txn No.',
      render: (r) => (
        <span className="font-mono text-xs text-slate-600">{r.txnNumber}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date & Time',
      render: (r) => (
        <div>
          <div className="text-sm text-slate-800">{fmt(r.createdAt)}</div>
          <div className="text-xs text-slate-400">{fmtTime(r.createdAt)}</div>
        </div>
      ),
    },
    {
      key: 'item',
      header: 'Item',
      render: (r) => (
        // Capped and truncated like the Reference column below it — as a secondary
        // column this sits inside the mobile card's justify-between row, and an
        // unconstrained two-line block there pushed 31 elements past the 390px
        // edge (every card, since CardRow gives it no width of its own).
        <div className="max-w-[160px]">
          <div className="truncate text-sm font-medium text-slate-800">{r.itemName}</div>
          <div className="truncate text-xs text-slate-400">
            {r.itemCode}{r.sku ? ` · ${r.sku}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (r) => (
        <StatusBadge
          tone={r.type === 'IN' ? 'good' : 'critical'}
        >
          {r.type === 'IN' ? '▲ IN' : '▼ OUT'}
        </StatusBadge>
      ),
    },
    {
      key: 'quantity',
      header: 'Qty',
      render: (r) => (
        <span className={`font-semibold tabular-nums ${r.type === 'IN' ? 'text-green-700' : 'text-red-600'}`}>
          {r.type === 'IN' ? '+' : '−'}{r.quantity.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'balanceQty',
      header: 'Balance After',
      render: (r) => (
        <span className="tabular-nums text-slate-700">{r.balanceQty.toFixed(2)}</span>
      ),
    },
    {
      key: 'flags',
      header: '',
      render: (r) => (
        <div className="flex gap-1">
          {r.isOverIssue && (
            <StatusBadge tone="warning">Over-issue</StatusBadge>
          )}
        </div>
      ),
    },
    {
      key: 'ref',
      header: 'Reference / Reason',
      render: (r) => (
        // R2-367: the reason is the audit justification; wrap it, never cut it (title carries the full text on hover).
        <div className="text-sm text-slate-500 max-w-[180px] break-words" title={[r.referenceNo, r.reason].filter(Boolean).join(' · ') || undefined}>
          {r.referenceNo && <span>{r.referenceNo}</span>}
          {r.referenceNo && r.reason && <span className="mx-1">·</span>}
          {r.reason && <span>{r.reason}</span>}
          {!r.referenceNo && !r.reason && <span className="text-slate-500">—</span>}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Transaction Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            All store movements · {paging ? paging.total : filtered.length} records
            {(search || typeFilter || itemFilter || fromDate || toDate) && (
              <span className="ml-1 text-slate-400">(filtered)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {canWrite && (
            <>
              <Button variant="secondary" onClick={openIn}>▲ Store IN</Button>
              <Button variant="secondary" onClick={openOut}>▼ Store OUT</Button>
            </>
          )}
          <button
            onClick={() => downloadCsv(filtered)}
            className="inline-flex min-h-11 items-center justify-center px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Summary chips */}
      {filtered.length > 0 && (
        <div className="flex gap-4 flex-wrap">
          <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm">
            <span className="text-green-600 font-semibold">▲ Total IN</span>
            <span className="ml-2 font-bold text-green-800 tabular-nums">{totalIn.toFixed(2)}</span>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm">
            <span className="text-red-600 font-semibold">▼ Total OUT</span>
            <span className="ml-2 font-bold text-red-800 tabular-nums">{totalOut.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Filters: a GET form, so search, filters and page live in the URL (R2-83). */}
      <form method="get" className="flex flex-wrap gap-3 items-end">
        <input
          type="search"
          name="q"
          placeholder="Search by txn no., item, ref…"
          defaultValue={search}
          className="w-full max-w-xs min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <select
          name="type"
          defaultValue={typeFilter}
          className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="">All Types</option>
          <option value="IN">IN only</option>
          <option value="OUT">OUT only</option>
        </select>
        <select
          name="itemId"
          defaultValue={itemFilter}
          className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 max-w-[200px]"
        >
          <option value="">All Items</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.code} — {item.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span>From</span>
          <input
            type="date"
            name="from"
            defaultValue={fromDate}
            className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <span>To</span>
          <input
            type="date"
            name="to"
            defaultValue={toDate}
            className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>
        <Button type="submit" variant="secondary">Apply</Button>
        {(search || typeFilter || itemFilter || fromDate || toDate) && (
          <a href="/mis/store/transactions" className="inline-flex min-h-11 items-center text-sm text-slate-600 underline">
            Clear filters
          </a>
        )}
      </form>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        emptyTitle="No transactions found"
        emptyBody={
          search || typeFilter || itemFilter || fromDate || toDate
            ? 'Try adjusting the filters.'
            : 'No store movements recorded yet.'
        }
      />
      {paging && <Pagination basePath="/mis/store/transactions" params={paging.params} page={paging.page} total={paging.total} />}

      <SlideOver
        open={inOpen}
        onClose={() => setInOpen(false)}
        title="Store IN"
        dirty={inForm.itemId !== '' || inForm.quantity !== ''}
        footer={
          <div className="flex gap-2">
            <Button onClick={submitIn} disabled={isPending}>Record IN</Button>
            <Button variant="ghost" onClick={() => setInOpen(false)}>Cancel</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 p-4">
          <Combobox
            label="Item"
            value={inForm.itemId || null}
            options={itemOptions}
            onChange={(v) => setInForm((f) => ({ ...f, itemId: v }))}
            placeholder="Select an item…"
          />
          {selectedInItem && (
            <p className="text-xs text-slate-500 -mt-2">
              Current balance: {selectedInItem.stockBalance.toFixed(2)} {selectedInItem.unit}
            </p>
          )}
          <NumberInput
            label="Quantity"
            value={inForm.quantity}
            onChange={(e) => setInForm((f) => ({ ...f, quantity: e.target.value }))}
            min="0"
            step="0.01"
          />
          <Input
            label="Reference No."
            value={inForm.referenceNo}
            onChange={(e) => setInForm((f) => ({ ...f, referenceNo: e.target.value }))}
            hint="e.g. GRN number or supplier invoice"
          />
          <Input
            label="Notes"
            value={inForm.notes}
            onChange={(e) => setInForm((f) => ({ ...f, notes: e.target.value }))}
          />
          {inError && <p className="text-sm text-red-600">{inError}</p>}
        </div>
      </SlideOver>

      <SlideOver
        open={outOpen}
        onClose={() => setOutOpen(false)}
        title="Store OUT"
        dirty={outForm.itemId !== '' || outForm.quantity !== ''}
        footer={
          <div className="flex gap-2">
            <Button onClick={submitOut} disabled={isPending}>Record OUT</Button>
            <Button variant="ghost" onClick={() => setOutOpen(false)}>Cancel</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 p-4">
          <Combobox
            label="Item"
            value={outForm.itemId || null}
            options={itemOptions}
            onChange={(v) => setOutForm((f) => ({ ...f, itemId: v }))}
            placeholder="Select an item…"
          />
          {selectedOutItem && (
            <p className="text-xs text-slate-500 -mt-2">
              Current balance: {selectedOutItem.stockBalance.toFixed(2)} {selectedOutItem.unit}
              {parseFloat(outForm.quantity || '0') > selectedOutItem.stockBalance && (
                <span className="ml-1 text-red-600 font-medium">— more than the stock balance, it will be refused</span>
              )}
            </p>
          )}
          <NumberInput
            label="Quantity"
            value={outForm.quantity}
            onChange={(e) => setOutForm((f) => ({ ...f, quantity: e.target.value }))}
            min="0"
            step="0.01"
          />
          <Combobox
            label="Against an order"
            value={outForm.orderId || null}
            options={targets.orders.map((o) => ({ value: o.id, label: `${o.orderNumber}${o.customerName ? ` — ${o.customerName}` : ''}` }))}
            onChange={(v) => setOutForm((f) => ({ ...f, orderId: v }))}
            placeholder="Select an order…"
          />
          <Select
            label="To which department"
            value={outForm.departmentId || null}
            options={targets.departments.map((d) => ({ value: d.id, label: d.name }))}
            onChange={(v) => setOutForm((f) => ({ ...f, departmentId: v }))}
            placeholder="Select a department…"
          />
          <Input
            label="Reference No."
            value={outForm.referenceNo}
            onChange={(e) => setOutForm((f) => ({ ...f, referenceNo: e.target.value }))}
            hint="e.g. job card or department requisition"
          />
          {outError && <p className="text-sm text-red-600">{outError}</p>}
        </div>
      </SlideOver>
    </div>
  );
}
