'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { Select } from '@/components/mis/kit/select';
import { SlideOver } from '@/components/mis/kit/slide-over';
import {
  createBomAction,
  addStageAction,
  addMaterialAction,
  submitBomAction,
  approveBomAction,
  deleteStageAction,
  deleteMaterialAction,
  reorderStagesAction,
  rejectBomAction,
  deleteBomAction,
  updateStageAction,
  updateMaterialAction,
} from '@/app/(mis)/mis/bom/actions';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { Combobox } from '@/components/ui/combobox';
import type { ActionResult } from '@/lib/mis/action-result';
import type { CatalogItem } from '@/lib/mis/catalog-search';
import { unitChoices, type OptionLike } from '@/lib/mis/item-options';
import { ItemPicker } from './item-picker';

type Material = { id: string; description: string; itemId?: string | null; quantity: number; unit: string; ratePerUnit: number | null; item: { name: string; unit: string } | null };
type Stage = { id: string; stageName: string; seq: number; processId?: string | null; process: { name: string } | null; materials: Material[] };
type Bom = { id: string; status: string; approvedAt: Date | null; stages: Stage[] } | null;

export function BomScreen({ bom, orderId, canWrite, isOwner, processes = [], items = [], units = [] }: { bom: Bom; orderId: string; canWrite: boolean; isOwner: boolean; processes?: { id: string; name: string }[]; /** R2-10: active catalog items for the material picker. */ items?: CatalogItem[]; /** R2-154: Master Units (group UNIT), for the Unit combobox. Free-text fallback when empty (no masters.read). */ units?: OptionLike[] }) {
  const unitOptions = unitChoices(units, undefined, true);
  const [stageOpen, setStageOpen] = useState(false);
  const [matOpen, setMatOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState('');
  const [stageName, setStageName] = useState('');
  const [stageProcessId, setStageProcessId] = useState('');
  const [editStageProcessId, setEditStageProcessId] = useState('');
  const [matDesc, setMatDesc] = useState('');
  const [matQty, setMatQty] = useState('');
  const [matUnit, setMatUnit] = useState('KG');
  const [matRate, setMatRate] = useState('');
  const [matItemId, setMatItemId] = useState<string | null>(null);
  const [editMatItemId, setEditMatItemId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { confirm, confirmDialog } = useConfirm();
  const { toast } = useToast();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [editStageId, setEditStageId] = useState<string | null>(null);
  const [editStageName, setEditStageName] = useState('');
  const [editMatId, setEditMatId] = useState<string | null>(null);
  const [editMatDesc, setEditMatDesc] = useState('');
  const [editMatQty, setEditMatQty] = useState('');
  const [editMatUnit, setEditMatUnit] = useState('');
  const [editMatRate, setEditMatRate] = useState('');
  /** A refusal comes back as a value; show it instead of swallowing it. True on success. */
  const settle = (result: ActionResult<unknown>) => { if (!result.ok) toast('error', result.detail); return result.ok; };

  if (!bom) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-slate-500">No BOM yet for this order.</p>
        {canWrite && (
          <Button
            onClick={() => startTransition(async () => { settle(await createBomAction(orderId)); })}
            disabled={isPending}
          >
            Create BOM
          </Button>
        )}
      </div>
    );
  }

  const addStage = () => startTransition(async () => {
    if (!settle(await addStageAction(bom.id, { stageName, ...(stageProcessId ? { processId: stageProcessId } : {}), seq: bom.stages.length }))) return;
    setStageName(''); setStageProcessId(''); setStageOpen(false);
  });

  const addMat = () => startTransition(async () => {
    const stage = bom.stages.find(s => s.id === selectedStageId);
    if (!settle(await addMaterialAction(selectedStageId, { description: matDesc, ...(matItemId ? { itemId: matItemId } : {}), quantity: parseFloat(matQty), unit: matUnit, ratePerUnit: matRate ? parseFloat(matRate) : undefined, seq: stage?.materials.length ?? 0 }))) return;
    setMatDesc(''); setMatQty(''); setMatRate(''); setMatItemId(null); setMatOpen(false);
  });

  const moveStage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= bom.stages.length) return;
    const order = bom.stages.map((s) => s.id);
    [order[index], order[target]] = [order[target], order[index]];
    startTransition(async () => { settle(await reorderStagesAction(bom.id, order)); });
  };

  const saveStage = () => startTransition(async () => {
    if (editStageId && settle(await updateStageAction(editStageId, { stageName: editStageName, processId: editStageProcessId || null }))) setEditStageId(null);
  });
  const saveMaterial = () => startTransition(async () => {
    if (!editMatId) return;
    // The rate is sent only when the Owner's field is on screen; the server ignores it for anyone else anyway.
    const ok = settle(await updateMaterialAction(editMatId, {
      description: editMatDesc, quantity: parseFloat(editMatQty), unit: editMatUnit, itemId: editMatItemId,
      ...(isOwner && editMatRate !== '' ? { ratePerUnit: parseFloat(editMatRate) } : {}),
    }));
    if (ok) setEditMatId(null);
  });
  const rejectBom = () => startTransition(async () => {
    if (settle(await rejectBomAction(orderId, rejectReason))) { setRejectOpen(false); setRejectReason(''); }
  });
  const deleteBom = async () => {
    if (!(await confirm({ title: 'Delete this BOM?', message: 'Its stages and materials are removed and the order shows "No BOM yet" again.', confirmLabel: 'Delete BOM', destructive: true }))) return;
    startTransition(async () => { settle(await deleteBomAction(orderId)); });
  };

  const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'good'> = { DRAFT: 'neutral', PENDING_APPROVAL: 'warning', APPROVED: 'good' };

  return (
    <div className="flex flex-col gap-4 text-slate-900">
      <div className="flex items-center gap-3">
        <StatusBadge tone={STATUS_TONE[bom.status] ?? 'neutral'}>{bom.status.replace(/_/g, ' ')}</StatusBadge>
        {canWrite && bom.status === 'DRAFT' && <Button onClick={() => setStageOpen(true)}>+ Stage</Button>}
        {canWrite && bom.status === 'DRAFT' && <Button onClick={() => startTransition(async () => { settle(await submitBomAction(bom.id)); })}>Submit for Approval</Button>}
        {canWrite && bom.status === 'DRAFT' && <Button variant="ghost" onClick={deleteBom} disabled={isPending}>Delete BOM</Button>}
        {isOwner && bom.status === 'PENDING_APPROVAL' && <Button onClick={() => startTransition(async () => { settle(await approveBomAction(bom.id)); })}>Approve BOM</Button>}
        {isOwner && bom.status === 'PENDING_APPROVAL' && <Button variant="ghost" onClick={() => { setRejectReason(''); setRejectOpen(true); }} disabled={isPending}>Reject</Button>}
      </div>
      <div className="flex flex-col gap-3">
        {bom.stages.map((stage, i) => (
          <div key={stage.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
              <span className="font-medium text-slate-800">{stage.stageName}</span>
              {stage.process && <span className="text-xs text-slate-500">({stage.process.name})</span>}
              <div className="ml-auto flex gap-2">
                {canWrite && bom.status === 'DRAFT' && (
                  <>
                    <Button variant="ghost" onClick={() => moveStage(i, -1)} disabled={isPending || i === 0}>↑</Button>
                    <Button variant="ghost" onClick={() => moveStage(i, 1)} disabled={isPending || i === bom.stages.length - 1}>↓</Button>
                    <Button variant="ghost" onClick={() => { setSelectedStageId(stage.id); setMatOpen(true); }}>+ Material</Button>
                    <Button variant="ghost" onClick={() => { setEditStageId(stage.id); setEditStageName(stage.stageName); setEditStageProcessId(stage.processId ?? ''); }}>Edit</Button>
                    <Button variant="ghost" onClick={() => startTransition(async () => { settle(await deleteStageAction(stage.id)); })}>Delete</Button>
                  </>
                )}
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {stage.materials.map(m => (
                <div key={m.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="flex-1 text-sm text-slate-700">
                    {m.description}
                    {m.item && !m.description.includes(m.item.name) ? ` (${m.item.name})` : ''}
                  </span>
                  <span className="font-mono text-sm font-semibold text-slate-900">{Number(m.quantity).toFixed(3)} {m.unit}</span>
                  {isOwner && m.ratePerUnit && <span className="font-mono text-sm text-slate-500">₹{Number(m.ratePerUnit).toFixed(2)}/unit</span>}
                  {canWrite && bom.status === 'DRAFT' && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditMatId(m.id); setEditMatDesc(m.description); setEditMatQty(String(Number(m.quantity))); setEditMatUnit(m.unit);
                          setEditMatItemId(m.itemId ?? null);
                          setEditMatRate(m.ratePerUnit != null ? String(Number(m.ratePerUnit)) : '');
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => startTransition(async () => { settle(await deleteMaterialAction(m.id)); })}
                      >
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {stage.materials.length === 0 && <div className="px-4 py-3 text-xs text-slate-500">No materials yet.</div>}
            </div>
          </div>
        ))}
        {bom.stages.length === 0 && <div className="text-center text-slate-500 py-8">Add stages to build the BOM.</div>}
      </div>

      <SlideOver open={stageOpen} onClose={() => setStageOpen(false)} title="Add Stage">
        <div className="flex flex-col gap-4 p-4">
          {processes.length > 0 ? (
            <Select label="Stage (process)" value={stageProcessId} placeholder="Select a process"
              options={processes.map(p => ({ value: p.id, label: p.name }))}
              onChange={(v) => { setStageProcessId(v); setStageName(processes.find(p => p.id === v)?.name ?? ''); }} />
          ) : (
            <Input label="Stage Name" value={stageName} onChange={e => setStageName(e.target.value)} />
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={addStage} disabled={isPending || !stageName}>Add</Button>
            <Button variant="ghost" onClick={() => setStageOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={editStageId !== null} onClose={() => setEditStageId(null)} title="Edit Stage">
        <div className="flex flex-col gap-4 p-4">
          {processes.length > 0 ? (
            <Select label="Stage (process)" value={editStageProcessId} placeholder="Select a process"
              options={processes.map(p => ({ value: p.id, label: p.name }))}
              onChange={(v) => { setEditStageProcessId(v); setEditStageName(processes.find(p => p.id === v)?.name ?? editStageName); }} />
          ) : (
            <Input label="Stage Name" value={editStageName} onChange={e => setEditStageName(e.target.value)} />
          )}
          <div className="flex gap-2 pt-2">
            <Button onClick={saveStage} disabled={isPending || !editStageName.trim()}>Save</Button>
            <Button variant="ghost" onClick={() => setEditStageId(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={editMatId !== null} onClose={() => setEditMatId(null)} title="Edit Material">
        <div className="flex flex-col gap-4 p-4">
          {items.length > 0 && (
            <ItemPicker items={items} value={editMatItemId} onChange={(it) => { setEditMatItemId(it?.id ?? null); if (it && !editMatDesc.trim()) setEditMatDesc(it.name); }} />
          )}
          <Input label="Description" value={editMatDesc} onChange={e => setEditMatDesc(e.target.value)} />
          <NumberInput label="Quantity" value={editMatQty} onChange={e => setEditMatQty(e.target.value)} />
          <Combobox label="Unit" value={editMatUnit || null} options={unitOptions} onChange={(v) => setEditMatUnit(v ?? '')} placeholder="Select unit" />
          {isOwner && <NumberInput label="Rate/Unit (₹)" value={editMatRate} onChange={e => setEditMatRate(e.target.value)} />}
          <div className="flex gap-2 pt-2">
            <Button onClick={saveMaterial} disabled={isPending || !editMatDesc.trim() || !editMatQty || !editMatUnit.trim()}>Save</Button>
            <Button variant="ghost" onClick={() => setEditMatId(null)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject BOM">
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">The BOM goes back to draft so it can be fixed and submitted again. Say what needs changing.</p>
          <Input label="Reason" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button variant="danger" onClick={rejectBom} disabled={isPending || rejectReason.trim().length < 3}>Reject BOM</Button>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
      {confirmDialog}

      <SlideOver open={matOpen} onClose={() => setMatOpen(false)} title="Add Material">
        <div className="flex flex-col gap-4 p-4">
          {items.length > 0 && (
            <ItemPicker
              items={items}
              value={matItemId}
              onChange={(it) => {
                setMatItemId(it?.id ?? null);
                // Picking an item fills the blanks, never overwrites what was typed.
                if (it && !matDesc.trim()) setMatDesc(it.name);
                if (it && it.unit) setMatUnit(it.unit);
              }}
            />
          )}
          <Input label="Description" value={matDesc} onChange={e => setMatDesc(e.target.value)} />
          <NumberInput label="Quantity" value={matQty} onChange={e => setMatQty(e.target.value)} />
          <Combobox label="Unit" value={matUnit || null} options={unitOptions} onChange={(v) => setMatUnit(v ?? '')} placeholder="Select unit" />
          {isOwner && <NumberInput label="Rate/Unit (₹)" value={matRate} onChange={e => setMatRate(e.target.value)} />}
          <div className="flex gap-2 pt-2">
            <Button onClick={addMat} disabled={isPending || !matDesc || !matQty}>Add</Button>
            <Button variant="ghost" onClick={() => setMatOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
