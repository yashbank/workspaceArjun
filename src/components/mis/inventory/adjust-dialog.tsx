'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { NumberInput, Input } from '@/components/mis/kit/input';
import { adjustInventoryAction } from '@/app/(mis)/mis/inventory/actions';

interface Props { itemId: string; itemName: string; currentBalance: number; unit: string }

export function AdjustDialog({ itemId, itemName, currentBalance, unit }: Props) {
  const [open, setOpen] = useState(false);
  const [changeQty, setChangeQty] = useState('');
  const [notes, setNotes] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSave = () => startTransition(async () => {
    const qty = parseFloat(changeQty);
    if (isNaN(qty) || qty === 0) return;
    await adjustInventoryAction(itemId, qty, notes || undefined);
    setChangeQty(''); setNotes(''); setOpen(false);
  });

  const qty = parseFloat(changeQty) || 0;
  const newBalance = currentBalance + qty;

  return (
    <>
      <Button onClick={() => setOpen(true)}>Adjust Stock</Button>
      <SlideOver open={open} onClose={() => setOpen(false)} title={`Adjust: ${itemName}`}>
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <span className="text-slate-500">Current: </span>
            <span className="font-semibold">{currentBalance} {unit}</span>
            {qty !== 0 && (
              <>
                <span className="mx-2 text-slate-400">→</span>
                <span className={`font-semibold ${newBalance >= 0 ? 'text-green-700' : 'text-red-600'}`}>{newBalance} {unit}</span>
              </>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Change Quantity</label>
            <p className="text-xs text-slate-500 mb-1">Positive to add stock, negative to remove</p>
            <NumberInput label="Change Quantity" value={changeQty} onChange={(e) => setChangeQty(e.target.value)} placeholder="+10 or -5" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for adjustment…" />
          </div>
          <Button onClick={handleSave} disabled={isPending || !changeQty || parseFloat(changeQty) === 0}>
            {isPending ? 'Saving…' : 'Save Adjustment'}
          </Button>
        </div>
      </SlideOver>
    </>
  );
}
