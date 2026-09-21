'use client';
import { useState, useTransition, useRef } from 'react';
import Link from 'next/link';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { Button } from '@/components/mis/kit/button';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { NumberInput, Input, Select } from '@/components/mis/kit/input';
import { adjustInventoryAction, createItemAction } from '@/app/(mis)/mis/inventory/actions';
import { MisItemCategory, MisItemUnit } from '@/generated/prisma/enums';

type InventoryRow = { itemId: string; code: string; name: string; unit: string | null; balance: number; lastUpdated: Date | null };
type Props = { summary: InventoryRow[]; canWrite?: boolean };

const CATEGORIES = Object.values(MisItemCategory);
const UNITS = Object.values(MisItemUnit);

function downloadInventoryCsv(rows: InventoryRow[]) {
  const headers = ['Code', 'Item Name', 'Unit', 'Balance', 'Last Updated'];
  const data = rows.map(r => [
    r.code, r.name, r.unit ?? '', String(r.balance),
    r.lastUpdated ? new Date(r.lastUpdated).toLocaleDateString('en-IN') : '',
  ]);
  const lines = [headers, ...data].map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function InventoryScreen({ summary, canWrite = false }: Props) {
  const [search, setSearch] = useState('');
  const [adjustItem, setAdjustItem] = useState<InventoryRow | null>(null);
  const [changeQty, setChangeQty] = useState('');
  const [adjNotes, setAdjNotes] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add Item state
  const [showAddItem, setShowAddItem] = useState(false);
  const [addName, setAddName] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addSku, setAddSku] = useState('');
  const [addCategory, setAddCategory] = useState<MisItemCategory>(MisItemCategory.OTHER);
  const [addUnit, setAddUnit] = useState<MisItemUnit>(MisItemUnit.PIECE);
  const [addPrice, setAddPrice] = useState('');
  const [addError, setAddError] = useState('');

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = search.trim()
    ? summary.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase()))
    : summary;

  const lowStock = summary.filter(r => r.balance <= 0).length;
  const totalItems = summary.length;

  const handleAdjust = () => {
    if (!adjustItem || !changeQty) return;
    const qty = parseFloat(changeQty);
    if (isNaN(qty) || qty === 0) { setError('Enter a non-zero quantity'); return; }
    setError('');
    startTransition(async () => {
      try {
        await adjustInventoryAction(adjustItem.itemId, qty, adjNotes || undefined);
        setSuccess(`${adjustItem.name} adjusted by ${qty > 0 ? '+' : ''}${qty}`);
        setAdjustItem(null); setChangeQty(''); setAdjNotes('');
      } catch (e: any) { setError(e.message ?? 'Adjustment failed'); }
    });
  };

  const handleAddItem = () => {
    if (!addName.trim()) { setAddError('Name is required'); return; }
    setAddError('');
    startTransition(async () => {
      try {
        const res = await createItemAction({ name: addName, code: addCode || undefined, sku: addSku || undefined, category: addCategory, unit: addUnit, pricePerUnit: addPrice || undefined });
        setSuccess(`Item ${res.code} created`);
        setShowAddItem(false); setAddName(''); setAddCode(''); setAddSku(''); setAddPrice(''); setAddCategory(MisItemCategory.OTHER); setAddUnit(MisItemUnit.PIECE);
      } catch (e: any) { setAddError(e.message ?? 'Failed to create item'); }
    });
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true); setImportError(''); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const res = await fetch('/api/mis/inventory/import', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setImportError(json.error ?? 'Import failed'); }
      else { setImportResult(json); setImportFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }
    } catch (e: any) { setImportError(e.message ?? 'Import failed'); }
    finally { setImporting(false); }
  };

  const adjustBtn: Column<InventoryRow> = {
    key: 'actions', header: '',
    render: (r: InventoryRow) => (
      <Button variant="ghost" onClick={() => { setAdjustItem(r); setChangeQty(''); setAdjNotes(''); setError(''); }}>Adjust</Button>
    ),
  };

  const columns: Column<InventoryRow>[] = [
    { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-sm">{r.code}</span> },
    { key: 'name', header: 'Item Name', render: (r) => (
      <Link href={`/mis/inventory/${r.itemId}`} className="font-medium text-slate-900 hover:text-blue-600 hover:underline">{r.name}</Link>
    )},
    { key: 'unit', header: 'Unit', render: (r) => r.unit ?? '—' },
    { key: 'balance', header: 'Balance', render: (r) => (
      <StatusBadge tone={r.balance <= 0 ? 'critical' : r.balance < 10 ? 'warning' : 'good'}>{String(r.balance)}</StatusBadge>
    )},
    { key: 'lastUpdated', header: 'Last Updated', render: (r) => r.lastUpdated ? new Date(r.lastUpdated).toLocaleDateString('en-IN') : '—' },
    ...(canWrite ? [adjustBtn] : []),
  ];

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>
        <div className="flex gap-2 items-center text-sm text-slate-500">
          <span>{totalItems} items</span>
          {lowStock > 0 && <span className="text-red-600 font-medium">{lowStock} out of stock</span>}
        </div>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-2 rounded-lg flex justify-between">
          {success}
          <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700">&#x2715;</button>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="search"
          placeholder="Search items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] max-w-sm min-h-12 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <button onClick={() => downloadInventoryCsv(filtered)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 whitespace-nowrap">
          ↓ CSV
        </button>
        {canWrite && (
          <>
            <a href="/api/mis/inventory/template" download className="px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 whitespace-nowrap">
              ↓ Excel Template
            </a>
            <button onClick={() => setShowImport(true)} className="px-3 py-2 text-sm border border-blue-200 rounded-lg hover:bg-blue-50 text-blue-700 whitespace-nowrap">
              ↑ Import CSV
            </button>
            <Button onClick={() => setShowAddItem(true)}>+ Add Item</Button>
          </>
        )}
      </div>

      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.itemId} emptyTitle="Inventory empty" emptyBody="Confirm GRNs to add items to inventory." />

      {/* Adjust Stock */}
      <SlideOver open={!!adjustItem} onClose={() => setAdjustItem(null)} title={`Adjust Stock — ${adjustItem?.name ?? ''}`}>
        <div className="flex flex-col gap-4 p-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <div className="text-slate-500">Current Balance</div>
            <div className="text-lg font-bold text-slate-900 mt-0.5">{adjustItem?.balance ?? 0} {adjustItem?.unit ?? ''}</div>
          </div>
          <NumberInput label="Change Quantity (positive = add, negative = remove)" value={changeQty} onChange={e => setChangeQty(e.target.value)} placeholder="e.g. 50 or -10" />
          <Input label="Reason / Notes" value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="Physical count, write-off, etc." />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAdjust} disabled={isPending || !changeQty}>{isPending ? 'Saving...' : 'Apply Adjustment'}</Button>
            <Button variant="ghost" onClick={() => setAdjustItem(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      {/* Add Item */}
      <SlideOver open={showAddItem} onClose={() => setShowAddItem(false)} title="Add Item">
        <div className="flex flex-col gap-4 p-4">
          <Input label="Item Name *" value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. Paper 80GSM A4" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Code (auto if blank)" value={addCode} onChange={e => setAddCode(e.target.value)} placeholder="ITM-XXXX" />
            <Input label="SKU" value={addSku} onChange={e => setAddSku(e.target.value)} placeholder="optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Category" value={addCategory} onChange={e => setAddCategory(e.target.value as MisItemCategory)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select label="Unit" value={addUnit} onChange={e => setAddUnit(e.target.value as MisItemUnit)}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </div>
          <NumberInput label="Price Per Unit (₹)" value={addPrice} onChange={e => setAddPrice(e.target.value)} placeholder="e.g. 250.00" />
          {addError && <p className="text-sm text-red-600">{addError}</p>}
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAddItem} disabled={isPending}>{isPending ? 'Creating...' : 'Create Item'}</Button>
            <Button variant="ghost" onClick={() => setShowAddItem(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      {/* Import */}
      <SlideOver open={showImport} onClose={() => { setShowImport(false); setImportResult(null); setImportError(''); }} title="Import Items from CSV">
        <div className="flex flex-col gap-4 p-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">Steps:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Download the Excel template (button in toolbar)</li>
              <li>Fill in data — do not change column headers</li>
              <li>In Excel: File → Save As → CSV UTF-8</li>
              <li>Upload the CSV file here</li>
            </ol>
            <p className="mt-2 text-xs text-blue-600">Categories: RAW_MATERIAL, CONSUMABLE, EQUIPMENT, OTHER<br/>Units: KG, LITRE, PIECE, REAM</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Select CSV File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={e => setImportFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-200 file:text-sm file:bg-slate-50 hover:file:bg-slate-100"
            />
          </div>

          {importError && <p className="text-sm text-red-600">{importError}</p>}

          {importResult && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              <p className="font-medium">Import complete</p>
              <p>Created: {importResult.created} · Updated: {importResult.updated} · Skipped: {importResult.skipped}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={handleImport} disabled={!importFile || importing}>{importing ? 'Importing...' : 'Import'}</Button>
            <Button variant="ghost" onClick={() => { setShowImport(false); setImportResult(null); setImportError(''); }}>Close</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
