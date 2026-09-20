'use client';

import { useState } from 'react';

import { commitIssueAction } from '@/app/(mis)/mis/store/actions';
import { cn } from '@/lib/utils';

import { HeaderCard, HomeStack, InfoCard, Mono, OkCard, SectionLabel } from '../home/cards';
import { ItemCart, type CartLine, type PickerItem } from './item-cart';

/**
 * Goods out.
 *
 * Same cart, one direction reversed and one extra rule: the factory cannot
 * issue what it does not have. The cart marks a short line red as it is typed,
 * and the server refuses the whole issue again on commit — the balances on
 * this page were true when it loaded, not necessarily now.
 */

type Props = {
  header: { title: string; meta: string };
  items: PickerItem[];
  orders: { id: string; orderNumber: string; customerName: string | null }[];
  departments: { id: string; name: string }[];
};

export function IssueScreen({ header, items, orders, departments }: Props) {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [done, setDone] = useState<{ reference: string; lineCount: number; totalQty: number } | null>(
    null,
  );

  async function commit(lines: CartLine[]) {
    const result = await commitIssueAction(lines, { orderId, departmentId });
    setDone(result);
  }

  return (
    <HomeStack>
      <HeaderCard title={header.title} meta={header.meta} />

      {done && (
        <OkCard>
          <SectionLabel>Issued</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">
            {done.lineCount} {done.lineCount === 1 ? 'line' : 'lines'} · {done.totalQty} total qty
            went to the floor.
          </p>
          <p className="mt-0.5">
            <Mono>{done.reference}</Mono>
          </p>
        </OkCard>
      )}

      <ItemCart items={items} mode="ISSUE" onCommit={commit}>
        {departments.length > 0 && (
          <InfoCard>
            <SectionLabel>To which department</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              <TargetChip
                active={departmentId === null}
                onClick={() => setDepartmentId(null)}
                label="Not recorded"
              />
              {departments.map((dept) => (
                <TargetChip
                  key={dept.id}
                  active={departmentId === dept.id}
                  onClick={() => setDepartmentId(dept.id)}
                  label={dept.name}
                />
              ))}
            </div>
          </InfoCard>
        )}

        {orders.length > 0 && (
          <InfoCard>
            <SectionLabel>Against an order</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              <TargetChip
                active={orderId === null}
                onClick={() => setOrderId(null)}
                label="General issue"
              />
              {orders.map((order) => (
                <TargetChip
                  key={order.id}
                  active={orderId === order.id}
                  onClick={() => setOrderId(order.id)}
                  label={order.orderNumber}
                  detail={order.customerName ?? undefined}
                  mono
                />
              ))}
            </div>
          </InfoCard>
        )}
      </ItemCart>

      {/* Clears the sticky foot and the tab bar below it. */}
      <div className="h-32" aria-hidden="true" />
    </HomeStack>
  );
}

function TargetChip({
  active,
  onClick,
  label,
  detail,
  mono,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  detail?: string;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 rounded-full border px-3 text-left text-sm font-semibold',
        active
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-slate-300 bg-white text-slate-700',
      )}
    >
      <span className={cn(mono && 'font-mono')}>{label}</span>
      {detail && (
        <span className={cn('ml-1.5 font-normal', active ? 'text-indigo-100' : 'text-slate-500')}>
          {detail}
        </span>
      )}
    </button>
  );
}
