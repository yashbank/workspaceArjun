'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { Button } from '@/components/mis/kit/button';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { NumberInput, Input } from '@/components/mis/kit/input';
import {
  storeInAction,
  storeOutAction,
  updateStoreItemAction,
  deactivateStoreItemAction,
} from '@/app/(mis)/mis/store/actions';

type ItemRow = {
  id: string;
  code: string;
  sku: string | null;
  name: string;
  category: string;
  unit: string;
  stockBalance: number;
  reorderLevel: number | null;
  pricePerUnit?: number | null;
  isDemo: boolean;
};

type Props = {
  items: ItemRow[];
  canWrite: boolean;
  isOwner: boolean;
};

const CATEGORY_LABEL: Record<string, string> = {
  RAW_MATERIAL: 'Raw Material',
  CONSUMABLE: 'Consumable',
  EQUIPMENT: 'Equipment Spare',
  OTHER: 'Other',
};

const CATEGORIES = Object.entries(CATEGORY_LABEL);

function downloadCsv(rows: ItemRow[], isOwner: boolean) {
  const headers = [
    'Code', 'SKU', 'Name', 'Category', 'Unit', 'Stock', 'Reorder Level',
    ...(isOwner ? ['Price/Unit (₹)'] : []),
  ];
  const data = rows.map((r) => [
    r.code,
    r.sku ?? '',
    r.name,
    CATEGORY_LABEL[r.category] ?? r.category,
    r.unit,
    String(r.stockBalance),
    r.reorderLevel != null ? String(r.reorderLevel) : '',
    ...(isOwner ? [r.pricePerUnit != null ? r.pricePerUnit.toFixed(2) : ''] : []),
  ]);
  const lines = [headers, ...data].map((row) =>
    row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','),
  );
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `store-items-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type SlideMode = 'in' | 'out' | 'edit' | null;

export function StoreItemScreen({ items, canWrite, isOwner }: Props) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Shared slide state
  const [slideItem, setSlideItem] = useState<ItemRow | null>(null);
  const [slideMode, setSlideMode] = useState<SlideMode>(null);

  // IN / OUT fields
  const [qty, setQty] = useState('');
  const [refNo, setRefNo] = useState('');
  const [reason, setReason] = useState('');

  // Edit fields (MIS-285)
  const [editCategory, setEditCategory] = useState('');
  const [editReorder, setEditReorder] = useState('');
  const [editPrice, setEditPrice] = useState('');

  // Deactivate confirm (MIS-286)
  const [deactivateItem, setDeactivateItem] = useState<ItemRow | null>(null);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const filtered = items.filter((r) => {
    const q = search.trim().toLowerCase();
    const matchSearch =
      !q ||
      r.name.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q) ||
      (r.sku ?? '').toLowerCase().includes(q);
    const matchCat = !categoryFilter || r.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const lowStockCount = items.filter(
    (r) => r.reorderLevel != null && r.stockBalance < r.reorderLevel,
  ).length;

  const openSlide = (item: ItemRow, mode: 'in' | 'out') => {
    setSlideItem(item);
    setSlideMode(mode);
    setQty('');
    setRefNo('');
    setReason('');
    setError('');
  };

  const openEdit = (item: ItemRow) => {
    setSlideItem(item);
    setSlideMode('edit');
    setEditCategory(item.category);
    setEditReorder(item.reorderLevel != null ? String(item.reorderLevel) : '');
    setEditPrice(item.pricePerUnit != null ? String(item.pricePerUnit) : '');
    setError('');
  };

  const closeSlide = () => {
    setSlideItem(null);
    setSlideMode(null);
  };

  // ----- IN / OUT submit -----
  const handleTxnSubmit = () => {
    if (!slideItem || !slideMode || slideMode === 'edit') return;
    const quantity = parseFloat(qty);
    if (isNaN(quantity) || quantity <= 0) {
      setError('Enter a valid quantity greater than 0');
      return;
    }
    const isOverIssue = slideMode === 'out' && quantity > slideItem.stockBalance;
    if (isOverIssue && !reason.trim()) {
      setError('Reason is required when issuing more than current stock');
      return;
    }
    setError('');
    startTransition(async () => {
      try {
        if (slideMode === 'in') {
          await storeInAction({ itemId: slideItem.id, quantity, referenceNo: refNo || undefined });
        } else {
          await storeOutAction({
            itemId: slideItem.id,
            quantity,
            referenceNo: refNo || undefined,
            reason: reason || undefined,
          });
        }
        setSuccess(
          slideMode === 'in'
            ? `Stock IN recorded for ${slideItem.name}`
            : `Stock OUT recorded for ${slideItem.name}`,
        );
        closeSlide();
      } catch (e: any) {
        setError(e.message ?? 'Operation failed');
      }
    });
  };

  // ----- Edit submit (MIS-285) -----
  const handleEditSubmit = () => {
    if (!slideItem) return;
    setError('');
    startTransition(async () => {
      try {
        await updateStoreItemAction(slideItem.id, {
          category: editCategory || undefined,
          reorderLevel: editReorder !== '' ? parseFloat(editReorder) : null,
          ...(isOwner ? { pricePerUnit: editPrice !== '' ? parseFloat(editPrice) : null } : {}),
        });
        setSuccess(`${slideItem.name} updated`);
        closeSlide();
      } catch (e: any) {
        setError(e.message ?? 'Update failed');
      }
    });
  };

  // ----- Deactivate submit (MIS-286) -----
  const handleDeactivate = () => {
    if (!deactivateItem) return;
    startTransition(async () => {
      try {
        await deactivateStoreItemAction(deactivateItem.id);
        setSuccess(`${deactivateItem.name} deactivated`);
        setDeactivateItem(null);
      } catch (e: any) {
        setError(e.message ?? 'Deactivation failed');
        setDeactivateItem(null);
      }
    });
  };

  const isOverIssue =
    slideMode === 'out' && slideItem != null && parseFloat(qty) > slideItem.stockBalance;

  const columns: Column<ItemRow>[] = [
    {
      key: 'sku',
      header: 'SKU',
      render: (r) => <span className="font-mono text-xs text-slate-500">{r.sku ?? '—'}</span>,
    },
    {
      key: 'name',
      header: 'Item Name',
      render: (r) => (
        <div>
          <div className="font-medium text-slate-900">{r.name}</div>
          <div className="text-xs text-slate-400">{r.code}</div>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      render: (r) => CATEGORY_LABEL[r.category] ?? r.category,
    },
    {
      key: 'unit',
      header: 'Unit',
      render: (r) => r.unit,
    },
    {
      key: 'stock',
      header: 'Stock',
      render: (r) => {
        const belowReorder = r.reorderLevel != null && r.stockBalance < r.reorderLevel;
        const tone = r.stockBalance <= 0 ? 'critical' : belowReorder ? 'warning' : 'good';
        return (
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge tone={tone}>
              {r.stockBalance.toFixed(2)} {r.unit}
            </StatusBadge>
            {r.reorderLevel != null && (
              <span className="text-[10px] text-slate-400">Reorder ≥ {r.reorderLevel}</span>
            )}
          </div>
        );
      },
    },
    ...(isOwner
      ? [
          {
            key: 'price',
            header: 'Price / Unit',
            render: (r: ItemRow) => (
              <div className="text-right">
                {r.pricePerUnit != null ? (
                  <span className="font-mono">₹{r.pricePerUnit.toFixed(2)}</span>
                ) : (
                  '—'
                )}
                {r.isDemo && (
                  <span className="ml-1 text-[9px] text-amber-500 font-medium">DEMO</span>
                )}
              </div>
            ),
          },
        ]
      : []),
    {
      key: 'ledger',
      header: '',
      render: (r: ItemRow) => (
        <Link
          href={`/mis/store/ledger/${r.id}`}
          className="text-xs text-slate-400 hover:text-slate-700 underline"
        >
          Ledger
        </Link>
      ),
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            render: (r: ItemRow) => (
              <div className="flex gap-1 justify-end flex-wrap">
                <Button variant="ghost" onClick={() => openSlide(r, 'in')}>
                  + IN
                </Button>
                <Button variant="ghost" onClick={() => openSlide(r, 'out')}>
                  OUT
                </Button>
                <Button variant="secondary" onClick={() => openEdit(r)}>
                  Edit
                </Button>
                <button
                  onClick={() => setDeactivateItem(r)}
                  className="inline-flex min-h-11 items-center rounded px-2 text-xs text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  Deactivate
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-6xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Store Items</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {items.length} items
            {lowStockCount > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                · {lowStockCount} below reorder level
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/mis/store/dashboard"
            className="inline-flex min-h-11 items-center justify-center px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
          >
            Dashboard
          </Link>
          <button
            onClick={() => downloadCsv(filtered, isOwner)}
            className="inline-flex min-h-11 items-center justify-center px-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
          >
            ↓ CSV
          </button>
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded-lg flex justify-between">
          {success}
          <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700">
            &#x2715;
          </button>
        </div>
      )}
      {error && !slideItem && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm px-4 py-2 rounded-lg flex justify-between">
          {error}
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
            &#x2715;
          </button>
        </div>
      )}

      {/* Deactivate confirm inline */}
      {deactivateItem && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="text-sm text-red-800">
            Deactivate <strong>{deactivateItem.name}</strong>? It will be removed from the active list.
            {deactivateItem.stockBalance > 0 && (
              <span className="ml-1 text-red-600">
                (Current stock: {deactivateItem.stockBalance.toFixed(2)} {deactivateItem.unit})
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="danger" onClick={handleDeactivate} disabled={isPending}>
              {isPending ? 'Deactivating…' : 'Confirm Deactivate'}
            </Button>
            <Button variant="ghost" onClick={() => setDeactivateItem(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search by name, code or SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        emptyTitle="No items found"
        emptyBody={search || categoryFilter ? 'Try clearing filters.' : 'No store items configured yet.'}
      />

      {/* Store IN / OUT slide-over */}
      <SlideOver
        open={!!slideItem && (slideMode === 'in' || slideMode === 'out')}
        onClose={closeSlide}
        title={
          slideMode === 'in'
            ? `Store IN — ${slideItem?.name ?? ''}`
            : `Store OUT — ${slideItem?.name ?? ''}`
        }
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm flex gap-6">
            <div>
              <div className="text-slate-500">Current Balance</div>
              <div className="text-lg font-bold text-slate-900 mt-0.5">
                {slideItem?.stockBalance?.toFixed(2)} {slideItem?.unit}
              </div>
            </div>
            {slideItem?.reorderLevel != null && (
              <div>
                <div className="text-slate-500">Reorder Level</div>
                <div className="text-base font-semibold text-slate-700 mt-0.5">
                  {slideItem.reorderLevel} {slideItem.unit}
                </div>
              </div>
            )}
          </div>

          <NumberInput
            label={slideMode === 'in' ? 'Quantity Received' : 'Quantity Issued'}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="e.g. 50"
          />

          {isOverIssue && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2">
              ⚠ Over-issue: issuing more than current stock ({slideItem?.stockBalance?.toFixed(2)}{' '}
              {slideItem?.unit}). Reason is required.
            </div>
          )}

          <Input
            label={
              slideMode === 'out' && isOverIssue
                ? 'Reason (required)'
                : 'Reason / Notes (optional)'
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={slideMode === 'in' ? 'GRN ref, supplier name…' : 'Order ref, job number…'}
          />

          <Input
            label="Reference No. (optional)"
            value={refNo}
            onChange={(e) => setRefNo(e.target.value)}
            placeholder="PO-XXXX, ORD-XXXX…"
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleTxnSubmit} disabled={isPending || !qty}>
              {isPending
                ? 'Saving…'
                : slideMode === 'in'
                  ? 'Record Stock IN'
                  : 'Record Stock OUT'}
            </Button>
            <Button variant="ghost" onClick={closeSlide}>
              Cancel
            </Button>
          </div>
        </div>
      </SlideOver>

      {/* Edit slide-over (MIS-285) */}
      <SlideOver
        open={!!slideItem && slideMode === 'edit'}
        onClose={closeSlide}
        title={`Edit — ${slideItem?.name ?? ''}`}
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
            SKU <span className="font-mono font-medium text-slate-700">{slideItem?.sku ?? '—'}</span>
            {' · '}Code <span className="font-mono font-medium text-slate-700">{slideItem?.code ?? '—'}</span>
            {' · '}Unit <span className="font-medium text-slate-700">{slideItem?.unit}</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Category</label>
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              {CATEGORIES.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          <NumberInput
            label="Reorder Level (optional)"
            value={editReorder}
            onChange={(e) => setEditReorder(e.target.value)}
            placeholder="e.g. 10"
          />

          {isOwner && (
            <div className="flex flex-col gap-1">
              <NumberInput
                label="Price per Unit ₹ (optional)"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder="e.g. 125.50"
              />
              {slideItem?.isDemo && (
                <p className="text-xs text-amber-600">
                  Currently using a demo price. Entering a real price will clear the demo flag.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleEditSubmit} disabled={isPending}>
              {isPending ? 'Saving…' : 'Save Changes'}
            </Button>
            <Button variant="ghost" onClick={closeSlide}>
              Cancel
            </Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
