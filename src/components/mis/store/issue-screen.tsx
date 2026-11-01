'use client';

import Link from 'next/link';
import { PageBack } from '@/components/mis/common/page-back';
import { useState } from 'react';

import { commitIssueAction, getItemBalancesAction } from '@/app/(mis)/mis/store/actions';
import { unwrap } from '@/lib/mis/action-result';
import { resolveGeneralUse } from '@/lib/mis/general-use';

import { HeaderCard, HomeStack, InfoCard, Mono, OkCard, SectionLabel } from '../home/cards';
import { EMPTY_GENERAL, GeneralUseFields, type GeneralFields } from './general-use-fields';
import { Combobox } from '@/components/ui/combobox';
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
  /** R2-80: where a no-order issue is charged. */
  costCenters?: { value: string; label: string }[];
  /** V2 Epic 2 — per open order, what is earmarked and what is left; the server enforces the same cap on Confirm. */
  allocations?: Record<string, { itemId: string; name: string; code: string; unit: string; allocated: number; issued: number; remaining: number }[]>;
  /** R2-121 — per open order with an APPROVED BOM, what each BOM stage material calls for and how much of it has gone out so far. Read-only context; the allocation cap above is unchanged. */
  bomMaterials?: Record<string, { stageName: string; description: string; itemId: string | null; required: number; unit: string; issued: number | null; remaining: number | null }[]>;
  /** R2-352: OWNER / SUPERVISOR may issue past the order's allocation with a reason; the server decides, this shows the field. */
  canOverrideQuota?: boolean;
};

export function IssueScreen({ header, items, orders, departments, costCenters = [], allocations = {}, bomMaterials = {}, canOverrideQuota = false }: Props) {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [general, setGeneral] = useState<GeneralFields>(EMPTY_GENERAL);
  const [done, setDone] = useState<{ reference: string; lineCount: number; totalQty: number } | null>(
    null,
  );

  async function commit(lines: CartLine[], key: string, overrideReason?: string) {
    // R2-80: no order => General / factory use with a reason and a cost centre (the server checks it again).
    resolveGeneralUse(orderId, general);
    // R2-352: the reason typed after an "allocated to this order" refusal travels as the quota override.
    const quotaOverride = overrideReason?.trim() ? { reason: overrideReason.trim() } : null;
    const result = unwrap(await commitIssueAction(lines, { orderId, departmentId, general: orderId ? null : general, quotaOverride }, key));
    setDone(result);
    setGeneral(EMPTY_GENERAL);
  }

  return (
    <HomeStack wide>
      <PageBack href="/mis/store/dashboard" label="Store overview" />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
        <Link href="/mis/store/dashboard" className="inline-flex min-h-11 items-center hover:text-slate-900">Store</Link>
        <span aria-hidden="true">/</span>
        <Link href="/mis/store/stock" className="inline-flex min-h-11 items-center hover:text-slate-900">Stock</Link>
        <span aria-hidden="true">/</span>
        <span className="font-medium text-slate-900">Material Issue</span>
      </nav>
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

      <ItemCart
        items={items}
        mode="ISSUE"
        onCommit={commit}
        refreshBalances={refreshBalances}
        canOverride={canOverrideQuota}
        // R2-349: the "Left on order" column, from this order's earmarks.
        leftOnOrder={orderId ? Object.fromEntries((allocations[orderId] ?? []).map((a) => [a.itemId, a.remaining])) : undefined}
      >
        {/* R2-346/347/353: searchable pickers instead of a wall of chips; "None" is General / factory use. */}
        {departments.length > 0 && (
          <InfoCard>
            <SectionLabel>To which department</SectionLabel>
            <div className="mt-2">
              <Combobox
                label="Department"
                hideLabel
                clearable
                value={departmentId}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                onChange={(v) => setDepartmentId(v || null)}
                placeholder="No department — type to search"
              />
            </div>
          </InfoCard>
        )}

        {orders.length > 0 && (
          <InfoCard>
            <SectionLabel>Against an order</SectionLabel>
            <div className="mt-2">
              <Combobox
                label="Order"
                hideLabel
                clearable
                value={orderId}
                options={orders.map((o) => ({ value: o.id, label: o.orderNumber, hint: o.customerName ?? undefined }))}
                onChange={(v) => setOrderId(v || null)}
                placeholder="No order — General / factory use (type an order # or customer)"
              />
            </div>
            {orderId && (allocations[orderId]?.length ?? 0) > 0 && (
              <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
                <SectionLabel>Allocated to this order</SectionLabel>
                <ul className="mt-1 text-sm text-slate-700">
                  {allocations[orderId].map((a) => (
                    <li key={a.itemId} className="flex justify-between gap-2">
                      <span className="truncate">{a.name} <span className="font-mono text-xs text-slate-500">{a.code}</span></span>
                      <span className={a.remaining <= 0 ? 'font-semibold text-red-700' : 'font-semibold'}>{a.remaining} {a.unit} left</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-slate-500">Issues against this order cannot exceed what is left. Other items issue from general stock.</p>
              </div>
            )}
            {orderId && (bomMaterials[orderId]?.length ?? 0) > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <SectionLabel>BOM materials for this order</SectionLabel>
                <ul className="mt-1 text-sm text-slate-700">
                  {bomMaterials[orderId].map((m, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{m.stageName} · {m.description}</span>
                      <span className={m.remaining !== null && m.remaining <= 0 ? 'font-semibold text-red-700' : ''}>
                        {m.remaining !== null ? `${m.remaining} / ${m.required} ${m.unit} left` : `${m.required} ${m.unit} called for (not in catalog)`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </InfoCard>
        )}
        {orderId === null && <GeneralUseFields value={general} onChange={setGeneral} costCenters={costCenters} />}
      </ItemCart>

      {/* Clears the sticky foot and the tab bar below it. */}
      <div className="h-32" aria-hidden="true" />
    </HomeStack>
  );
}

/** R2-66: fresh balances for the cart, via the server action (unwrapped to a plain map). */
async function refreshBalances(): Promise<Record<string, number>> {
  return unwrap(await getItemBalancesAction());
}
