'use client';

import { useMemo, useState } from 'react';

import { commitReceiptAction } from '@/app/(mis)/mis/store/actions';
import { Input } from '@/components/mis/kit/input';
import type { PoPurpose } from '@/lib/mis/po-purpose';
import { cn } from '@/lib/utils';

import { HeaderCard, HomeStack, InfoCard, Mono, OkCard, SectionLabel } from '../home/cards';
import { ItemCart, type CartLine, type PickerItem } from './item-cart';

/**
 * Goods in.
 *
 * The supplier, the purchase order and the invoice number are all optional and
 * all live above the cart: a delivery that turns up without paperwork still has
 * to be put into stock, and making the storekeeper find a PO first is how the
 * app ends up bypassed with a paper register.
 */

export type ReceivePo = {
  id: string;
  poNumber: string;
  supplierId: string | null;
  supplierName: string | null;
  /** A buffer-stock PO has no BOM and no order behind it — both paths receive the same way. */
  purpose: PoPurpose;
  itemIds: string[];
};

type Props = {
  header: { title: string; meta: string };
  items: PickerItem[];
  suppliers: { id: string; name: string }[];
  openPos: ReceivePo[];
};

export function ReceiveScreen({ header, items, suppliers, openPos }: Props) {
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [poId, setPoId] = useState<string | null>(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [done, setDone] = useState<{ reference: string; lineCount: number; totalQty: number } | null>(
    null,
  );

  // A PO belongs to a supplier, so picking one narrows the other.
  const visiblePos = useMemo(
    () => (supplierId ? openPos.filter((po) => po.supplierId === supplierId) : openPos),
    [openPos, supplierId],
  );

  function chooseSupplier(id: string | null) {
    setSupplierId(id);
    if (poId) {
      const po = openPos.find((p) => p.id === poId);
      if (po && po.supplierId !== id) setPoId(null);
    }
  }

  function choosePo(id: string | null) {
    setPoId(id);
    const po = openPos.find((p) => p.id === id);
    if (po?.supplierId) setSupplierId(po.supplierId);
  }

  async function commit(lines: CartLine[]) {
    const result = await commitReceiptAction(lines, {
      supplierId,
      poId,
      invoiceNo: invoiceNo.trim() || null,
    });
    setDone(result);
    setInvoiceNo('');
    setPoId(null);
  }

  return (
    <HomeStack>
      <HeaderCard title={header.title} meta={header.meta} />

      {done && (
        <OkCard>
          <SectionLabel>Received</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">
            {done.lineCount} {done.lineCount === 1 ? 'line' : 'lines'} · {done.totalQty} total qty
            went into stock.
          </p>
          <p className="mt-0.5">
            <Mono>{done.reference}</Mono>
          </p>
        </OkCard>
      )}

      <ItemCart
        items={items}
        mode="RECEIVE"
        onCommit={commit}
        suppliers={suppliers}
        supplierId={supplierId}
        onSupplierChange={chooseSupplier}
      >
        {visiblePos.length > 0 && (
          <InfoCard>
            <SectionLabel>Against a purchase order</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              <PoChip active={poId === null} onClick={() => choosePo(null)} label="No PO" />
              {visiblePos.map((po) => (
                <PoChip
                  key={po.id}
                  active={poId === po.id}
                  onClick={() => choosePo(po.id)}
                  label={po.poNumber}
                  detail={
                    po.purpose === 'BUFFER_STOCK'
                      ? [po.supplierName, 'buffer stock'].filter(Boolean).join(' · ')
                      : (po.supplierName ?? undefined)
                  }
                />
              ))}
            </div>
            {poId === null && (
              <p className="mt-2 text-sm text-slate-500">
                Without a PO the stock still goes in — no GRN number is raised for it.
              </p>
            )}
          </InfoCard>
        )}

        <InfoCard>
          <Input
            label="Supplier invoice or challan number"
            value={invoiceNo}
            onChange={(event) => setInvoiceNo(event.target.value)}
            placeholder="Optional"
            autoComplete="off"
          />
        </InfoCard>
      </ItemCart>

      {/* Clears the sticky foot and the tab bar below it. */}
      <div className="h-32" aria-hidden="true" />
    </HomeStack>
  );
}

function PoChip({
  active,
  onClick,
  label,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  detail?: string;
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
      <span className="font-mono">{label}</span>
      {detail && (
        <span className={cn('ml-1.5 font-normal', active ? 'text-indigo-100' : 'text-slate-500')}>
          {detail}
        </span>
      )}
    </button>
  );
}
