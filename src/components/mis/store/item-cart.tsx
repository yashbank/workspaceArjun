'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { EmptyState } from '@/components/mis/kit/empty-state';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { scanOutcome } from '@/lib/mis/scan-input';
import { cn } from '@/lib/utils';

import { InfoCard, Mono, SectionLabel } from '../home/cards';
import { ScanButton } from './scan-button';

/**
 * The cart.
 *
 * A storekeeper standing at the gate with a fifteen-line delivery will not
 * fill in fifteen forms, so he does not have to: he searches, taps, and the
 * line lands in a pile he can adjust. Nothing is written until Confirm, and
 * Confirm is one server round trip for the whole pile.
 *
 * Two taps per item is the budget — tap the search result, and if the quantity
 * is not 1, tap +. Anything that costs a third tap for the common case has
 * failed. That is why a second tap on an item already in the cart bumps its
 * quantity instead of opening a duplicate line, and why the search box clears
 * itself after every add: the next thing he does is always type the next code.
 *
 * Deliberately knows nothing about GRNs, suppliers or orders. It is handed a
 * list of items and a commit function; RECEIVE and ISSUE differ only by a rate
 * field and the words on the button.
 */

export type PickerItem = {
  id: string;
  code: string;
  /** R2-68: a printed barcode may carry the SKU instead of the item code. */
  sku?: string | null;
  name: string;
  unit: string;
  /** Current stock. ISSUE mode refuses to go past it. */
  balance: number;
};

export type CartLine = {
  itemId: string;
  qty: number;
  /** RECEIVE only. */
  rate: number | null;
};

export type SupplierOption = { id: string; name: string };

type Props = {
  items: PickerItem[];
  /** REQUEST (V2 Epic 3) is an ask, not a ledger move: the balance is shown but never enforced. */
  mode: 'RECEIVE' | 'ISSUE' | 'REQUEST';
  /**
   * `key` is one UUID per cart open (R3-STK B11): pressing Confirm twice, or retrying after a dropped connection, books
   * once. `overReceiptReason` is set only after an Admin/Owner chose "Override with reason" (B03).
   */
  onCommit: (lines: CartLine[], key: string, overReceiptReason?: string) => Promise<void>;
  /** RECEIVE, ADMIN/OWNER only: offer "Override with reason" when the server refuses a line past the order + 2%. */
  canOverride?: boolean;
  /** RECEIVE: who delivered. Rendered as a chip row when passed. */
  suppliers?: SupplierOption[];
  supplierId?: string | null;
  onSupplierChange?: (id: string | null) => void;
  /** RECEIVE: show the per-line rate input. Owner only (D5) — everyone else never sees the field. */
  canSetRate?: boolean;
  /** Anything else the screen wants above the cart — a PO, an order, a department. */
  children?: ReactNode;
  /**
   * R2-66: fetch fresh balances (item id -> qty). Called when the window regains focus, from the "Refresh stock"
   * button, and just before Confirm, so a cart left open on a phone never trusts a stale number.
   */
  refreshBalances?: () => Promise<Record<string, number>>;
};

type DraftLine = {
  itemId: string;
  /** A string, because a half-typed "1." is a legitimate state mid-edit. */
  qty: string;
  rate: string;
};

const MAX_MATCHES = 5;

export function ItemCart({
  items,
  mode,
  onCommit,
  suppliers,
  supplierId = null,
  onSupplierChange,
  canSetRate = false,
  canOverride = false,
  children,
  refreshBalances,
}: Props) {
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overOpen, setOverOpen] = useState(false);
  const [overDraft, setOverDraft] = useState('');
  // R2-66: balances fetched after the page loaded; they win over the (possibly minutes-old) ones the page was given.
  const [live, setLive] = useState<Record<string, number> | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  // A fresh key after every success; the same key for a retry of the same cart.
  const commitKey = useRef<string>(newKey());

  const searchRef = useRef<HTMLInputElement | null>(null);
  const qtyRefs = useRef(new Map<string, HTMLInputElement>());

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const balanceOf = useCallback((item: PickerItem) => live?.[item.id] ?? item.balance, [live]);
  const isReceive = mode === 'RECEIVE';
  const guardsStock = mode === 'ISSUE';

  /** Code first, then name — a storekeeper reading off a delivery note types the code. */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const scored = items
      .map((item) => {
        const code = item.code.toLowerCase();
        const name = item.name.toLowerCase();
        if (code.startsWith(q)) return { item, rank: 0 };
        if (name.startsWith(q)) return { item, rank: 1 };
        if (code.includes(q)) return { item, rank: 2 };
        if (name.includes(q)) return { item, rank: 3 };
        return null;
      })
      .filter((hit): hit is { item: PickerItem; rank: number } => hit !== null);
    scored.sort((a, b) => a.rank - b.rank || a.item.name.localeCompare(b.item.name));
    return scored.slice(0, MAX_MATCHES).map((hit) => hit.item);
  }, [items, query]);

  /** Returns the fresh map (or null when it could not be fetched — the page's numbers then stand, the server still checks). */
  const refresh = useCallback(async (): Promise<Record<string, number> | null> => {
    if (!refreshBalances) return null;
    try {
      const fresh = await refreshBalances();
      setLive(fresh);
      setRefreshedAt(new Date());
      return fresh;
    } catch {
      return null;
    }
  }, [refreshBalances]);

  useEffect(() => {
    if (!refreshBalances) return;
    const onFocus = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh, refreshBalances]);

  const addItem = useCallback((itemId: string) => {
    setError(null);
    setLines((current) => {
      const existing = current.find((line) => line.itemId === itemId);
      if (!existing) return [...current, { itemId, qty: '1', rate: '' }];
      // Already in the cart — bump it rather than opening a second line for
      // the same thing, which is how a cart ends up double-counting.
      return current.map((line) =>
        line.itemId === itemId
          ? { ...line, qty: String(round2((Number(line.qty) || 0) + 1)) }
          : line,
      );
    });
    setQuery('');
    // Put the caret back where the next item will be typed, and show the
    // storekeeper the line he just touched.
    window.setTimeout(() => {
      qtyRefs.current.get(itemId)?.focus();
      qtyRefs.current.get(itemId)?.select();
    }, 0);
  }, []);

  const onScan = useCallback((raw: string) => {
    const outcome = scanOutcome(items, raw);
    setScanNote(outcome.message);
    if (outcome.item) addItem(outcome.item.id);
    else setQuery(outcome.fallbackQuery);
  }, [items, addItem]);

  const step = useCallback((itemId: string, delta: number) => {
    setError(null);
    setLines((current) =>
      current.map((line) =>
        line.itemId === itemId
          ? { ...line, qty: String(Math.max(0, round2((Number(line.qty) || 0) + delta))) }
          : line,
      ),
    );
  }, []);

  const patch = useCallback((itemId: string, field: 'qty' | 'rate', value: string) => {
    setError(null);
    setLines((current) =>
      current.map((line) => (line.itemId === itemId ? { ...line, [field]: value } : line)),
    );
  }, []);

  const remove = useCallback((itemId: string) => {
    setError(null);
    qtyRefs.current.delete(itemId);
    setLines((current) => current.filter((line) => line.itemId !== itemId));
  }, []);

  const totalQty = lines.reduce((sum, line) => round2(sum + (Number(line.qty) || 0)), 0);

  /** ISSUE cannot promise stock the factory does not have. Checked again server-side. */
  const shortLines = lines.filter((line) => {
    if (!guardsStock) return false;
    const item = byId.get(line.itemId);
    return item ? (Number(line.qty) || 0) > balanceOf(item) : false;
  });

  const blankLines = lines.filter((line) => (Number(line.qty) || 0) <= 0);
  const canConfirm =
    lines.length > 0 && shortLines.length === 0 && blankLines.length === 0 && !busy;

  async function confirm(overReceiptReason?: string) {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      // R2-66: look at the stock one more time before committing; a line gone short is shown, not sent.
      if (guardsStock && refreshBalances) {
        const fresh = await refresh();
        const short = fresh
          ? lines.filter((l) => (Number(l.qty) || 0) > (fresh[l.itemId] ?? byId.get(l.itemId)?.balance ?? 0)).map((l) => byId.get(l.itemId)?.name ?? 'an item')
          : [];
        if (short.length > 0) throw new Error(`Stock changed while this cart was open — not enough of ${short.join(', ')} now. Lower the quantity and confirm again.`);
      }
      await onCommit(
        lines.map((line) => ({
          itemId: line.itemId,
          qty: round2(Number(line.qty) || 0),
          rate: isReceive && canSetRate && line.rate.trim() !== '' ? Number(line.rate) : null,
        })),
        commitKey.current,
        overReceiptReason,
      );
      commitKey.current = newKey();
      setLines([]);
      setQuery('');
      searchRef.current?.focus();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Zone 1 — the search bar, pinned. */}
      <div className="sticky top-14 z-20 -mx-1 px-1 pb-1 pt-1">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3">
            <SearchIcon />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              inputMode="search"
              autoComplete="off"
              aria-label="Scan or search an item"
              placeholder="Scan or search — code or name"
              className="min-h-12 w-full bg-transparent text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear the search"
                className="shrink-0 rounded-full p-1 text-slate-400"
              >
                <CrossIcon />
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* R2-68/78: the camera only ever fills the search box or adds the matching item — typing always works. */}
            <ScanButton onScan={onScan} />
            {refreshBalances && (
              <button
                type="button"
                onClick={() => void refresh()}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 active:bg-slate-100"
              >
                Refresh stock
              </button>
            )}
            {refreshedAt && <span className="text-xs text-slate-500">Stock as of {refreshedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          {scanNote && <p role="status" className="mt-2 text-sm font-medium text-slate-700">{scanNote}</p>}

          {query.trim() !== '' && (
            <div className="mt-2">
              {matches.length === 0 ? (
                <p className="px-1 py-2 text-sm text-slate-500">
                  Nothing matches “{query.trim()}”.
                </p>
              ) : (
                matches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addItem(item.id)}
                    className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left active:bg-indigo-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">
                        {item.name}
                      </span>
                      <Mono>
                        {item.code} · {balanceOf(item)} {item.unit} in stock
                      </Mono>
                    </span>
                    <span className="shrink-0 rounded-full bg-indigo-600 px-3 py-1 text-sm font-semibold text-white">
                      Add
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {suppliers && suppliers.length > 0 && (
        <InfoCard>
          <SectionLabel>Supplier</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            <ChipButton
              active={supplierId === null}
              onClick={() => onSupplierChange?.(null)}
              label="Not recorded"
            />
            {suppliers.map((supplier) => (
              <ChipButton
                key={supplier.id}
                active={supplierId === supplier.id}
                onClick={() => onSupplierChange?.(supplier.id)}
                label={supplier.name}
              />
            ))}
          </div>
        </InfoCard>
      )}

      {children}

      {/* Zone 2 — the pile. */}
      {lines.length === 0 ? (
        <EmptyState
          title="Scan or search an item to start"
          body={
            isReceive
              ? 'Add every line on the delivery note, then confirm once.'
              : 'Add everything going to the floor, then confirm once.'
          }
        />
      ) : (
        lines.map((line) => {
          const item = byId.get(line.itemId);
          if (!item) return null;
          const qty = Number(line.qty) || 0;
          const short = guardsStock && qty > balanceOf(item);
          return (
            <InfoCard key={line.itemId} className={cn(short && 'border-red-200 bg-red-50')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{item.name}</p>
                  <Mono>
                    {item.code} · {balanceOf(item)} {item.unit} in stock
                  </Mono>
                </div>
                <button
                  type="button"
                  onClick={() => remove(line.itemId)}
                  aria-label={`Remove ${item.name}`}
                  className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-slate-400 active:bg-slate-100"
                >
                  <CrossIcon />
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <StepButton
                  onClick={() => step(line.itemId, -1)}
                  label={`One less ${item.name}`}
                  glyph="−"
                />
                <input
                  ref={(node) => {
                    if (node) qtyRefs.current.set(line.itemId, node);
                    else qtyRefs.current.delete(line.itemId);
                  }}
                  value={line.qty}
                  onChange={(event) => patch(line.itemId, 'qty', event.target.value)}
                  inputMode="decimal"
                  aria-label={`Quantity of ${item.name} in ${item.unit}`}
                  className="min-h-12 w-20 rounded-xl border border-slate-300 bg-white text-center text-lg font-semibold text-slate-900 focus:outline-2 focus:outline-slate-900"
                />
                <StepButton
                  onClick={() => step(line.itemId, 1)}
                  label={`One more ${item.name}`}
                  glyph="+"
                />
                <span className="text-sm font-medium text-slate-500">{item.unit}</span>

                {isReceive && canSetRate && (
                  <span className="ml-auto flex items-center gap-1">
                    <span className="text-sm text-slate-500">₹</span>
                    <input
                      value={line.rate}
                      onChange={(event) => patch(line.itemId, 'rate', event.target.value)}
                      inputMode="decimal"
                      aria-label={`Rate per ${item.unit} for ${item.name}`}
                      placeholder="rate"
                      className="min-h-12 w-20 rounded-xl border border-slate-300 bg-white px-2 text-center text-base text-slate-900 focus:outline-2 focus:outline-slate-900"
                    />
                  </span>
                )}
              </div>

              {short && (
                <p className="mt-2 text-sm font-medium text-red-700">
                  Only {balanceOf(item)} {item.unit} in stock.
                </p>
              )}
            </InfoCard>
          );
        })
      )}

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <SectionLabel>Not saved</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">{error}</p>
          {canOverride && isReceive && /more than 2%/.test(error) && (
            <button
              type="button"
              onClick={() => { setOverDraft(''); setOverOpen(true); }}
              className="mt-3 min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900"
            >
              Override with reason
            </button>
          )}
        </section>
      )}

      <SlideOver open={overOpen} onClose={() => setOverOpen(false)} title="Override the 2% limit">
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">This delivery is more than the order plus 2%. Give a reason; it is recorded.</p>
          <input
            value={overDraft}
            onChange={(event) => setOverDraft(event.target.value)}
            aria-label="Reason for the override"
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900"
          />
          <button
            type="button"
            disabled={overDraft.trim().length < 3 || busy}
            onClick={() => { setOverOpen(false); void confirm(overDraft.trim()); }}
            className="min-h-12 rounded-xl bg-indigo-600 px-4 text-base font-semibold text-white disabled:bg-slate-300"
          >
            Override and confirm
          </button>
        </div>
      </SlideOver>

      {/* Zone 3 — the sticky foot, above the tab bar. */}
      <div className="fixed inset-x-0 bottom-14 z-40 mx-auto max-w-[420px] border-t border-slate-200 bg-white px-4 py-3">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-semibold text-slate-900">
            {lines.length} {lines.length === 1 ? 'item' : 'items'}
            <span className="font-normal text-slate-500"> · {totalQty} total qty</span>
          </p>
          {shortLines.length > 0 && (
            <p className="text-xs font-semibold text-red-700">
              {shortLines.length} over stock
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={!canConfirm}
          aria-busy={busy || undefined}
          className={cn(
            'w-full rounded-xl py-3.5 text-base font-semibold text-white',
            canConfirm ? 'bg-indigo-600 hover:bg-indigo-700' : 'cursor-not-allowed bg-slate-300',
          )}
        >
          {busy ? 'Saving…' : isReceive ? 'Confirm receipt' : mode === 'REQUEST' ? 'Send request' : 'Confirm issue'}
        </button>
      </div>
    </>
  );
}

function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function StepButton({
  onClick,
  label,
  glyph,
}: {
  onClick: () => void;
  label: string;
  glyph: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-2xl font-semibold leading-none text-slate-700 active:bg-slate-100"
    >
      {glyph}
    </button>
  );
}

function ChipButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-11 rounded-full border px-3 text-sm font-semibold',
        active
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-slate-300 bg-white text-slate-700',
      )}
    >
      {label}
    </button>
  );
}

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'h-5 w-5 shrink-0',
  'aria-hidden': true,
} as const;

function SearchIcon() {
  return (
    <svg {...ICON} className="h-5 w-5 shrink-0 text-slate-400">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg {...ICON}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
