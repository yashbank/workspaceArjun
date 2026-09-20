'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { Input } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { DataTable, type Column } from '@/components/mis/kit/data-table';
import { addDocumentAction, deleteDocumentAction } from '@/app/(mis)/mis/documents/actions';

type Doc = { id: string; name: string; description: string | null; filePath: string; fileSize: number | null; mimeType: string | null; createdAt: Date; uploadedByProfile: { name: string | null; email: string } | null };
type Order = { id: string; orderNumber: string; description: string | null };
type Props = { orders: Order[]; canWrite: boolean };

function fmtSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsScreen({ orders, canWrite }: Props) {
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [filePath, setFilePath] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleOrderChange = (v: string) => {
    setSelectedOrderId(v);
    if (!v) { setDocs([]); return; }
    startTransition(async () => {
      try {
        const res = await fetch(`/api/mis/docs/${v}`);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        setDocs(data);
      } catch {
        setDocs([]);
      }
    });
  };

  const handleAdd = () => {
    if (!name || !filePath || !selectedOrderId) return;
    startTransition(async () => {
      await addDocumentAction(selectedOrderId, { name: name.trim(), description: desc.trim() || undefined, filePath: filePath.trim() });
      setName(''); setDesc(''); setFilePath(''); setOpen(false);
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this document?')) return;
    startTransition(async () => {
      await deleteDocumentAction(id);
    });
  };

  const cols: Column<Doc>[] = [
    { key: 'name', header: 'Name', render: r => <span className="font-medium">{r.name}</span> },
    { key: 'description', header: 'Description', render: r => r.description ?? '—' },
    { key: 'fileSize', header: 'Size', render: r => fmtSize(r.fileSize) },
    { key: 'mimeType', header: 'Type', render: r => r.mimeType ?? '—' },
    { key: 'uploadedBy', header: 'Uploaded By', render: r => r.uploadedByProfile?.name ?? '—' },
    { key: 'createdAt', header: 'Date', render: r => new Date(r.createdAt).toLocaleDateString('en-IN') },
    { key: 'actions', header: '', render: r => (
      <div className="flex gap-2 justify-end">
        <a href={r.filePath} target="_blank" rel="noopener" className="text-sm text-blue-600 hover:underline">Download</a>
        {canWrite && <Button variant="ghost" onClick={() => handleDelete(r.id)}>Delete</Button>}
      </div>
    )},
  ];

  const orderOptions = [
    { value: '', label: '— Select Order —' },
    ...orders.map(o => ({ value: o.id, label: `${o.orderNumber}${o.description ? ` — ${o.description}` : ''}` })),
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Documents</h1>
        {canWrite && selectedOrderId && <Button onClick={() => setOpen(true)}>+ Add Document</Button>}
      </div>

      <div className="mb-6 max-w-xs">
        <Select label="Filter by Order" value={selectedOrderId} onChange={handleOrderChange} options={orderOptions} />
      </div>

      {!selectedOrderId ? (
        <p className="text-slate-500">Select an order above to view its documents.</p>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg font-medium mb-1">No documents yet</p>
          <p className="text-sm">Attach specs, COAs or photos to this order.</p>
        </div>
      ) : (
        <DataTable columns={cols} rows={docs} rowKey={r => r.id} emptyTitle="No documents" emptyBody="Add documents to this order." />
      )}

      <SlideOver open={open} onClose={() => setOpen(false)} title="Add Document">
        <div className="flex flex-col gap-4 p-4">
          <Input label="Document Name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. COA March 2024" />
          <Input label="Description (optional)" value={desc} onChange={e => setDesc(e.target.value)} />
          <Input label="File Path / URL" value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="https://..." />
          <p className="text-xs text-slate-500">Paste a storage URL or path. File upload will be added in a future version.</p>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleAdd} disabled={isPending || !name || !filePath}>{isPending ? 'Saving…' : 'Add'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
