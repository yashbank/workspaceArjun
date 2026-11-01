'use client';

import Link from 'next/link';
import { useState } from 'react';

import { getItemBalancesAction } from '@/app/(mis)/mis/store/actions';
import { createMaterialRequestAction } from '@/app/(mis)/mis/store/requests/actions';
import { unwrap } from '@/lib/mis/action-result';
import { resolveGeneralUse } from '@/lib/mis/general-use';
import { cn } from '@/lib/utils';

import { HeaderCard, HomeStack, InfoCard, Mono, OkCard, SectionLabel } from '../home/cards';
import { EMPTY_GENERAL, GeneralUseFields, type GeneralFields } from './general-use-fields';
import { ItemCart, type CartLine, type PickerItem } from './item-cart';

/**
 * A Material Issue Note — the issue cart, but it ASKS. Nothing leaves the ledger until the Store
 * approves on /mis/store/requests/[id]. Equipment and other items against an order are refused by
 * the server with a message naming the lines.
 */
type Props = {
  header: { title: string; meta: string };
  items: PickerItem[];
  orders: { id: string; orderNumber: string; customerName: string | null }[];
  departments: { id: string; name: string }[];
  /** R2-80: where a no-order request is charged. */
  costCenters?: { value: string; label: string }[];
};

export function RequestScreen({ header, items, orders, departments, costCenters = [] }: Props) {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [general, setGeneral] = useState<GeneralFields>(EMPTY_GENERAL);
  const [cartKey, setCartKey] = useState(0);
  const [done, setDone] = useState<{ id: string; requestNumber: string } | null>(null);

  async function commit(lines: CartLine[]) {
    resolveGeneralUse(orderId, general); // R2-80: no order => General / factory use (the server checks it again)
    const result = unwrap(await createMaterialRequestAction(
      lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
      { orderId, departmentId, general: orderId ? null : general },
    ));
    setDone(result);
  }

  return (
    <HomeStack wide>
      <HeaderCard title={header.title} meta={header.meta} />
      {done && (
        <OkCard>
          <SectionLabel>Requested</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">
            <Mono>{done.requestNumber}</Mono> is waiting for the Store.
          </p>
          <Link href={`/mis/store/requests/${done.id}`} className="mt-1 inline-flex min-h-11 items-center text-sm text-indigo-600 underline">
            Open request
          </Link>
          <button
            type="button"
            onClick={() => { setDone(null); setOrderId(null); setDepartmentId(null); setGeneral(EMPTY_GENERAL); setCartKey((k) => k + 1); }}
            className="mt-1 ml-4 inline-flex min-h-11 items-center text-sm text-indigo-600 underline"
          >
            Create another request
          </button>
        </OkCard>
      )}

      {!done && <ItemCart key={cartKey} items={items} mode="REQUEST" onCommit={commit} refreshBalances={refreshBalances}>
        {departments.length > 0 && (
          <InfoCard>
            <SectionLabel>For which department</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip active={departmentId === null} onClick={() => setDepartmentId(null)} label="No department" />
              {departments.map((d) => (
                <Chip key={d.id} active={departmentId === d.id} onClick={() => setDepartmentId(d.id)} label={d.name} />
              ))}
            </div>
          </InfoCard>
        )}
        {orders.length > 0 && (
          <InfoCard>
            <SectionLabel>Against an order (raw material and consumables only)</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip active={orderId === null} onClick={() => setOrderId(null)} label="No order — General / factory use" />
              {orders.map((o) => (
                <Chip key={o.id} active={orderId === o.id} onClick={() => setOrderId(o.id)} label={o.orderNumber} detail={o.customerName ?? undefined} mono />
              ))}
            </div>
          </InfoCard>
        )}
        {orderId === null && <GeneralUseFields value={general} onChange={setGeneral} costCenters={costCenters} />}
      </ItemCart>}
      <div className="h-32" aria-hidden="true" />
    </HomeStack>
  );
}

/** R2-66: fresh balances for the cart, via the server action (unwrapped to a plain map). */
async function refreshBalances(): Promise<Record<string, number>> {
  return unwrap(await getItemBalancesAction());
}

function Chip({ active, onClick, label, detail, mono }: { active: boolean; onClick: () => void; label: string; detail?: string; mono?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 rounded-full border px-3 text-left text-sm font-semibold',
        active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700',
      )}
    >
      <span className={cn(mono && 'font-mono')}>{label}</span>
      {detail && <span className={cn('ml-1.5 font-normal', active ? 'text-indigo-100' : 'text-slate-500')}>{detail}</span>}
    </button>
  );
}
