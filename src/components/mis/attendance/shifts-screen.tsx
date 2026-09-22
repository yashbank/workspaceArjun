'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { Input, TimeInput } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { saveShiftAction } from '@/app/(mis)/mis/attendance/actions';

type Shift = { id: string; name: string; startTime: string; endTime: string; isDefault: boolean; isActive: boolean };

interface Props { shifts: Shift[]; canWrite: boolean }

export function ShiftsScreen({ shifts, canWrite }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [isPending, startTransition] = useTransition();

  const openAdd = () => {
    setEditing(null); setName(''); setStartTime('09:00'); setEndTime('18:00'); setOpen(true);
  };

  const openEdit = (s: Shift) => {
    setEditing(s); setName(s.name); setStartTime(s.startTime); setEndTime(s.endTime); setOpen(true);
  };

  const handleSave = () => startTransition(async () => {
    await saveShiftAction(editing?.id ?? null, { name, startTime, endTime });
    setOpen(false);
  });

  function calcHours(start: string, end: string): string {
    try {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff <= 0) return '—';
      return `${Math.floor(diff / 60)}h ${diff % 60}m`;
    } catch { return '—'; }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Shift Management</h1>
        {canWrite && <Button onClick={openAdd}>+ Add Shift</Button>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {shifts.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No shifts configured. Add your first shift.</div>
        ) : (
          shifts.map((shift) => (
            <div key={shift.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{shift.name}</span>
                  {shift.isDefault && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Default</span>
                  )}
                  {!shift.isActive && (
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-medium">Inactive</span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">
                  {shift.startTime} – {shift.endTime} · {calcHours(shift.startTime, shift.endTime)}
                </div>
              </div>
              {canWrite && (
                <Button variant="ghost" onClick={() => openEdit(shift)}>Edit</Button>
              )}
            </div>
          ))
        )}
      </div>

      <SlideOver open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Shift' : 'Add Shift'}>
        <div className="flex flex-col gap-4 p-4">
          <Input label="Shift Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning Shift" />
          <TimeInput label="Start Time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <TimeInput label="End Time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={isPending || !name}>{isPending ? 'Saving…' : 'Save'}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
