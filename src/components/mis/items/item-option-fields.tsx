'use client';
import Link from 'next/link';
import { Select } from '@/components/mis/kit/select';
import { labelChoices, unitChoices } from '@/lib/mis/item-options';
import type { ItemFormOptions } from '@/app/(mis)/mis/inventory/actions';

type Props = {
  /** Null while loading; the selects render empty until it arrives. */
  options: ItemFormOptions | null;
  gsm: string;
  size: string;
  unit: string;
  onGsm: (v: string) => void;
  onSize: (v: string) => void;
  onUnit: (v: string) => void;
};

function EmptyHint({ group }: { group: string }) {
  return <p className="text-xs text-slate-500">Add values in Masters → {group}</p>;
}

/**
 * GSM, Size and Unit as dropdowns of the active master options (R3-MST B32). GSM and Size store the option
 * LABEL; a stored value that is not in the masters stays selectable as "<value> (not in masters)".
 */
export function ItemOptionFields({ options, gsm, size, unit, onGsm, onSize, onUnit }: Props) {
  const gsmChoices = labelChoices(options?.gsm ?? [], gsm);
  const sizeChoices = labelChoices(options?.size ?? [], size);
  const unitList = unitChoices(options?.unit ?? []);
  const manage = (group: string) =>
    options?.canManage ? (
      <Link href="/mis/masters" className="text-xs text-sky-700 hover:underline">Open Masters → {group}</Link>
    ) : null;
  return (
    <>
      <div className="flex flex-col gap-1">
        <Select label="GSM" value={gsm || null} options={gsmChoices} onChange={onGsm} placeholder="Select GSM" />
        {options && options.gsm.length === 0 && <><EmptyHint group="GSM" />{manage('GSM')}</>}
      </div>
      <div className="flex flex-col gap-1">
        <Select label="Size" value={size || null} options={sizeChoices} onChange={onSize} placeholder="Select size" />
        {options && options.size.length === 0 && <><EmptyHint group="Size" />{manage('Size')}</>}
      </div>
      <Select label="Unit" value={unit || null} options={unitList} onChange={onUnit} placeholder="Select unit" />
    </>
  );
}
