'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Combobox } from '@/components/ui/combobox';
import { labelChoices, unitChoices, withCurrentUnit, type OptionLike } from '@/lib/mis/item-options';
import { addItemOptionAction, type ItemFormOptions } from '@/app/(mis)/mis/inventory/actions';

type Props = {
  /** Null while loading; the selects render empty until it arrives. */
  options: ItemFormOptions | null;
  gsm: string;
  size: string;
  substrate?: string;
  coating?: string;
  unit: string;
  onGsm: (v: string) => void;
  onSize: (v: string) => void;
  onSubstrate?: (v: string) => void;
  onCoating?: (v: string) => void;
  onUnit: (v: string) => void;
};

type Group = 'GSM' | 'SIZE' | 'SUBSTRATE' | 'COATING' | 'UNIT';

function EmptyHint({ group }: { group: string }) {
  return <p className="text-xs text-slate-500">Add values in Masters → {group}</p>;
}

/** Inline "+ Add new <thing>" for masters.write holders (R2-02/25/84/85). Persists to the master options, audited server-side. */
function AddOption({ group, noun, onAdded }: { group: Group; noun: string; onAdded: (o: OptionLike) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="min-h-11 self-start text-sm font-medium text-sky-700 hover:underline">+ Add new {noun}</button>;
  }
  const add = async () => {
    setBusy(true); setErr(null);
    const r = await addItemOptionAction(group, text);
    setBusy(false);
    if (!r.ok) { setErr(r.detail); return; }
    onAdded(r.value); setText(''); setOpen(false);
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input aria-label={`New ${noun}`} value={text} onChange={(e) => setText(e.target.value)} className="min-h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-base" />
        <button type="button" onClick={add} disabled={busy || !text.trim()} className="min-h-11 rounded-lg bg-slate-900 px-3 text-sm text-white disabled:bg-slate-400">{busy ? 'Adding…' : 'Add'}</button>
        <button type="button" onClick={() => { setOpen(false); setErr(null); }} className="min-h-11 px-2 text-sm text-slate-600">Cancel</button>
      </div>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    </div>
  );
}

/**
 * GSM, Size, Substrate, Coating and Unit as searchable comboboxes (R2-82) of the active master options (R2-02/25/84/85). The four
 * attribute fields store the option LABEL, Unit stores the option value; a stored value that is not in the
 * masters stays selectable. Admin/Owner (`canManage`) can add a new option inline without leaving the form.
 */
export function ItemOptionFields({ options, gsm, size, substrate = '', coating = '', unit, onGsm, onSize, onSubstrate, onCoating, onUnit }: Props) {
  const [extra, setExtra] = useState<Record<Group, OptionLike[]>>({ GSM: [], SIZE: [], SUBSTRATE: [], COATING: [], UNIT: [] });
  const merged = (g: Group, base: OptionLike[] | undefined) => {
    const list = [...(base ?? [])];
    for (const o of extra[g]) if (!list.some((x) => x.value === o.value)) list.push(o);
    return list;
  };
  const gsmList = merged('GSM', options?.gsm);
  const sizeList = merged('SIZE', options?.size);
  const substrateList = merged('SUBSTRATE', options?.substrate);
  const coatingList = merged('COATING', options?.coating);
  const unitList = withCurrentUnit(unitChoices(merged('UNIT', options?.unit), undefined, true), unit);
  const added = (g: Group, pick: (v: string) => void, useLabel: boolean) => (o: OptionLike) => {
    setExtra((p) => ({ ...p, [g]: [...p[g], o] }));
    pick(useLabel ? o.label : o.value);
  };
  const manage = (group: string) =>
    options?.canManage ? (
      <Link href="/mis/masters" className="text-xs text-sky-700 hover:underline">Open Masters → {group}</Link>
    ) : null;
  const field = (g: Group, label: string, noun: string, list: OptionLike[], cur: string, pick: ((v: string) => void) | undefined, hint: boolean) => (
    <div className="flex flex-col gap-1">
      <Combobox label={label} value={cur || null} options={g === 'UNIT' ? list : labelChoices(list, cur)} onChange={(v) => pick?.(v)} placeholder={`Select ${noun}`} />
      {hint && options && list.length === 0 && <><EmptyHint group={label} />{manage(label)}</>}
      {options?.canManage && <AddOption group={g} noun={noun} onAdded={added(g, (v) => pick?.(v), g !== 'UNIT')} />}
    </div>
  );
  return (
    <>
      {field('GSM', 'GSM', 'GSM', gsmList, gsm, onGsm, true)}
      {field('SIZE', 'Size', 'size', sizeList, size, onSize, true)}
      {field('SUBSTRATE', 'Substrate', 'substrate', substrateList, substrate, onSubstrate, false)}
      {field('COATING', 'Coating', 'coating', coatingList, coating, onCoating, false)}
      {field('UNIT', 'Unit', 'unit', unitList, unit, onUnit, false)}
    </>
  );
}
