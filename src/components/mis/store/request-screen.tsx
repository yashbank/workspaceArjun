'use client';

import Link from 'next/link';
import { useState } from 'react';

import { createMaterialRequestAction } from '@/app/(mis)/mis/store/requests/actions';
import { cn } from '@/lib/utils';

import { HeaderCard, HomeStack, InfoCard, Mono, OkCard, SectionLabel } from '../home/cards';
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
};

export function RequestScreen({ header, items, orders, departments }: Props) {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; requestNumber: string } | null>(null);

  async function commit(lines: CartLine[]) {
    const result = await createMaterialRequestAction(
      lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
      { orderId, departmentId },
    );
    setDone(result);
  }

  return (
    <HomeStack>
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
        </OkCard>
      )}

      <ItemCart items={items} mode="ISSUE" onCommit={commit}>
        {departments.length > 0 && (
          <InfoCard>
            <SectionLabel>For which department</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip active={departmentId === null} onClick={() => setDepartmentId(null)} label="Not recorded" />
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
              <Chip active={orderId === null} onClick={() => setOrderId(null)} label="General / overhead" />
              {orders.map((o) => (
                <Chip key={o.id} active={orderId === o.id} onClick={() => setOrderId(o.id)} label={o.orderNumber} detail={o.customerName ?? undefined} mono />
              ))}
            </div>
          </InfoCard>
        )}
      </ItemCart>
      <div className="h-32" aria-hidden="true" />
    </HomeStack>
  );
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
