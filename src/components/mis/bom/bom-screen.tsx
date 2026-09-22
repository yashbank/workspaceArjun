'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { Input, NumberInput } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';
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
} from '@/app/(mis)/mis/bom/actions';

type Material = { id: string; description: string; quantity: number; unit: string; ratePerUnit: number | null; item: { name: string; unit: string } | null };
type Stage = { id: string; stageName: string; seq: number; process: { name: string } | null; materials: Material[] };
type Bom = { id: string; status: string; approvedAt: Date | null; stages: Stage[] } | null;

export function BomScreen({ bom, orderId, canWrite, isOwner }: { bom: Bom; orderId: string; canWrite: boolean; isOwner: boolean }) {
  const [stageOpen, setStageOpen] = useState(false);
  const [matOpen, setMatOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState('');
  const [stageName, setStageName] = useState('');
  const [matDesc, setMatDesc] = useState('');
  const [matQty, setMatQty] = useState('');
  const [matUnit, setMatUnit] = useState('KG');
  const [matRate, setMatRate] = useState('');
  const [isPending, startTransition] = useTransition();

  if (!bom) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <p className="text-slate-400">No BOM yet for this order.</p>
        {canWrite && (
          <Button
            onClick={() => startTransition(async () => { await createBomAction(orderId); })}
            disabled={isPending}
          >
            Create BOM
          </Button>
        )}
      </div>
    );
  }

  const addStage = () => startTransition(async () => {
    await addStageAction(bom.id, { stageName, seq: bom.stages.length });
    setStageName(''); setStageOpen(false);
  });

  const addMat = () => startTransition(async () => {
    const stage = bom.stages.find(s => s.id === selectedStageId);
    await addMaterialAction(selectedStageId, { description: matDesc, quantity: parseFloat(matQty), unit: matUnit, ratePerUnit: matRate ? parseFloat(matRate) : undefined, seq: stage?.materials.length ?? 0 });
    setMatDesc(''); setMatQty(''); setMatRate(''); setMatOpen(false);
  });

  const moveStage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= bom.stages.length) return;
    const order = bom.stages.map((s) => s.id);
    [order[index], order[target]] = [order[target], order[index]];
    startTransition(async () => { await reorderStagesAction(bom.id, order); });
  };

  const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'good'> = { DRAFT: 'neutral', PENDING_APPROVAL: 'warning', APPROVED: 'good' };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <StatusBadge tone={STATUS_TONE[bom.status] ?? 'neutral'}>{bom.status.replace(/_/g, ' ')}</StatusBadge>
        {canWrite && bom.status === 'DRAFT' && <Button onClick={() => setStageOpen(true)}>+ Stage</Button>}
        {canWrite && bom.status === 'DRAFT' && <Button onClick={() => startTransition(async () => { await submitBomAction(bom.id); })}>Submit for Approval</Button>}
        {isOwner && bom.status === 'PENDING_APPROVAL' && <Button onClick={() => startTransition(async () => { await approveBomAction(bom.id); })}>Approve BOM</Button>}
      </div>
      <div className="flex flex-col gap-3">
        {bom.stages.map((stage, i) => (
          <div key={stage.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200">
              <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
              <span className="font-medium text-slate-800">{stage.stageName}</span>
              {stage.process && <span className="text-xs text-slate-400">({stage.process.name})</span>}
              <div className="ml-auto flex gap-2">
                {canWrite && bom.status === 'DRAFT' && (
                  <>
                    <Button variant="ghost" onClick={() => moveStage(i, -1)} disabled={isPending || i === 0}>↑</Button>
                    <Button variant="ghost" onClick={() => moveStage(i, 1)} disabled={isPending || i === bom.stages.length - 1}>↓</Button>
                    <Button variant="ghost" onClick={() => { setSelectedStageId(stage.id); setMatOpen(true); }}>+ Material</Button>
                    <Button variant="ghost" onClick={() => startTransition(async () => { await deleteStageAction(stage.id); })}>Delete</Button>
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
                    <Button
                      variant="ghost"
                      onClick={() => startTransition(async () => { await deleteMaterialAction(m.id); })}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {stage.materials.length === 0 && <div className="px-4 py-3 text-xs text-slate-400">No materials yet.</div>}
            </div>
          </div>
        ))}
        {bom.stages.length === 0 && <div className="text-center text-slate-400 py-8">Add stages to build the BOM.</div>}
      </div>

      <SlideOver open={stageOpen} onClose={() => setStageOpen(false)} title="Add Stage">
        <div className="flex flex-col gap-4 p-4">
          <Input label="Stage Name" value={stageName} onChange={e => setStageName(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={addStage} disabled={isPending || !stageName}>Add</Button>
            <Button variant="ghost" onClick={() => setStageOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={matOpen} onClose={() => setMatOpen(false)} title="Add Material">
        <div className="flex flex-col gap-4 p-4">
          <Input label="Description" value={matDesc} onChange={e => setMatDesc(e.target.value)} />
          <NumberInput label="Quantity" value={matQty} onChange={e => setMatQty(e.target.value)} />
          <Input label="Unit" value={matUnit} onChange={e => setMatUnit(e.target.value)} />
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
