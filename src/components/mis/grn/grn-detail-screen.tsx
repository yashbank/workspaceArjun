'use client';
import { PageBack } from '@/components/mis/common/page-back';
import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { Card, CardRow } from '@/components/mis/kit/card';
import { DateInput, NumberInput } from '@/components/mis/kit/input';
import { Select } from '@/components/mis/kit/select';
import { Input } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useRouter } from 'next/navigation';
import { addGrnItemAction, confirmGrnAction, discardGrnAction, removeGrnItemAction, returnQuarantineAction, reverseGrnAction, updateGrnHeaderAction, updateGrnItemAction } from '@/app/(mis)/mis/grn/actions';
import { unwrap } from '@/lib/mis/action-result';

type GrnItem = {
  id: string;
  receivedQty: { toNumber(): number } | number;
  type: string;
  forOrderRef: string | null;
  batchNo: string | null;
  dcQuantity?: number | null;
  damageQuantity?: number;
  shortQuantity?: number | null;
  poItem: { id: string; description: string; quantity: { toNumber(): number } | number; item: { id: string; name: string } | null };
};
type PoItem = {
  id: string;
  description: string;
  quantity: { toNumber(): number } | number;
  /** Confirmed receipts to date (a counter on the PO line). */
  receivedQuantity?: { toNumber(): number } | number;
  item: { id: string; name: string } | null;
};
type Grn = {
  id: string;
  grnNumber: string;
  status: string;
  notes: string | null;
  supplierInvoiceNo?: string | null;
  invoiceDate?: Date | string | null;
  /** Money: present only for the Owner (the server strips it for everyone else). */
  supplierInvoiceAmount?: number | null;
  lrNumber?: string | null;
  vehicleNumber?: string | null;
  transporterName?: string | null;
  dcNumber?: string | null;
  /** R2-277 */
  reverseReason?: string | null;
  po: { id: string; poNumber: string; supplier: { id: string; name: string } | null; items: PoItem[] } | null;
  items: GrnItem[];
};
/** R2-278: a damaged lot held apart from stock (quantities only, never money). */
export type QuarantineRow = { id: string; itemName: string; unit: string; quantity: number; status: string; returnedAt: Date | string | null; returnNote: string | null };
type Props = { grn: Grn; canWrite: boolean; /** R2-71: confirmed / in-production orders a line can be earmarked for. */ orders?: { id: string; orderNumber: string; customerName: string | null }[]; /** ADMIN/OWNER: may take more than the order + 2% with a reason (R3-STK B03). */ canOverride?: boolean; canSeeMoney?: boolean; /** Server-formatted (Owner only); null otherwise. */ invoiceAmountFormatted?: string | null; /** R2-277/R2-278: the Owner may reverse a confirmed GRN and return quarantined goods. */ canReverse?: boolean; quarantine?: QuarantineRow[] };

const isoDate = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function toNum(v: { toNumber(): number } | number): number {
  return typeof v === 'number' ? v : v.toNumber();
}

/** A typed number, or null when it is blank or not a finite number (parseFloat would read "12abc" as 12 and "abc" as NaN). */
function parseAmount(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function GrnDetailScreen({ grn, canWrite, orders = [], canOverride = false, canSeeMoney = false, invoiceAmountFormatted = null, canReverse = false, quarantine = [] }: Props) {
  const [isPending, startTransition] = useTransition();
  const [selectedPoItemId, setSelectedPoItemId] = useState('');
  const [qty, setQty] = useState('');
  const [dcQty, setDcQty] = useState('');
  const [damageQty, setDamageQty] = useState('');
  const [itemError, setItemError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [header, setHeader] = useState({
    supplierInvoiceNo: grn.supplierInvoiceNo ?? '',
    invoiceDate: isoDate(grn.invoiceDate),
    supplierInvoiceAmount: grn.supplierInvoiceAmount != null ? String(grn.supplierInvoiceAmount) : '',
    lrNumber: grn.lrNumber ?? '',
    vehicleNumber: grn.vehicleNumber ?? '',
    transporterName: grn.transporterName ?? '',
    dcNumber: grn.dcNumber ?? '',
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  // R3-STK B03: an Admin/Owner's reason for going past the 2% tolerance. Once given it rides on every later call of this screen.
  const [overReason, setOverReason] = useState('');
  // R2-277 / R2-278
  const [reverseOpen, setReverseOpen] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState<Record<string, string>>({});
  const runReverse = () => startTransition(async () => {
    setReverseError(null);
    try {
      unwrap(await reverseGrnAction(grn.id, reverseReason));
      setReverseOpen(false);
    } catch (e) {
      setReverseError(e instanceof Error ? e.message : 'That did not save.');
    }
  });
  const runReturn = (id: string) => startTransition(async () => {
    try { unwrap(await returnQuarantineAction(id, grn.id, returnNote[id] || null)); } catch (e) { setConfirmError(e instanceof Error ? e.message : 'That did not save.'); }
  });
  const [overOpen, setOverOpen] = useState(false);
  const [overDraft, setOverDraft] = useState('');
  const retryWithReason = useRef<((reason: string) => void) | null>(null);
  // R2-279: past the 5% ceiling only the Owner (canReverse marks the Owner here) is offered the reason box.
  const isOverRefusal = (message: string) => (/more than 5%/.test(message) ? canReverse : canOverride && /more than 2%/.test(message));
  const offerOverride = (retry: (reason: string) => void) => { retryWithReason.current = retry; };
  const [headerSaved, setHeaderSaved] = useState(false);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const setH = (k: keyof typeof header) => (e: React.ChangeEvent<HTMLInputElement>) => { setHeaderSaved(false); setHeader({ ...header, [k]: e.target.value }); };

  /** Save the paperwork typed in the form; true when it is on the GRN. Confirm calls this first (R2-72). */
  const persistHeader = async (): Promise<boolean> => {
    setHeaderError(null);
    const amount = header.supplierInvoiceAmount.trim() === '' ? null : parseAmount(header.supplierInvoiceAmount);
    if (canSeeMoney && header.supplierInvoiceAmount.trim() !== '' && amount === null) {
      setHeaderError('Supplier invoice amount must be a number.');
      return false;
    }
    try {
      const saved = unwrap(await updateGrnHeaderAction(grn.id, {
        supplierInvoiceNo: header.supplierInvoiceNo || null,
        invoiceDate: header.invoiceDate || null,
        ...(canSeeMoney ? { supplierInvoiceAmount: amount } : {}),
        lrNumber: header.lrNumber || null,
        vehicleNumber: header.vehicleNumber || null,
        transporterName: header.transporterName || null,
        dcNumber: header.dcNumber || null,
      }));
      setWarnings(saved?.warnings ?? []);
      setHeaderSaved(true);
      return true;
    } catch (e) {
      setHeaderError(e instanceof Error ? e.message : 'That did not save.');
      return false;
    }
  };
  const handleSaveHeader = () => {
    startTransition(async () => { await persistHeader(); });
  };
  const [type, setType] = useState('GENERAL');
  const [orderRef, setOrderRef] = useState('');
  const [batchNo, setBatchNo] = useState('');

  const isDraft = grn.status === 'DRAFT';
  // #12: every PO line with room left stays pickable, so one line can take several batches. Room =
  // ordered - received on confirmed GRNs - already on this GRN; the server cap stays the authority.
  const remainingOf = (poItem: PoItem) => {
    const onThisGrn = grn.items.filter(i => i.poItem.id === poItem.id).reduce((sum, i) => sum + toNum(i.receivedQty), 0);
    return Math.round((toNum(poItem.quantity) - toNum(poItem.receivedQuantity ?? 0) - onThisGrn) * 100) / 100;
  };
  const availablePoItems = (grn.po?.items ?? []).filter(i => canOverride || remainingOf(i) > 0); // R2-12: Admin/Owner can add a further batch past the order (reason required)

  // #11: edit / remove a line on a DRAFT.
  const { confirm: askConfirm, confirmDialog } = useConfirm();
  const [editLine, setEditLine] = useState<GrnItem | null>(null);
  const [editFields, setEditFields] = useState({ received: '', dc: '', damage: '', batch: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);

  const openEdit = (item: GrnItem) => {
    setEditLine(item);
    setEditError(null);
    setEditFields({
      received: String(toNum(item.receivedQty)),
      dc: item.dcQuantity != null ? String(item.dcQuantity) : '',
      damage: item.damageQuantity ? String(item.damageQuantity) : '',
      batch: item.batchNo ?? '',
    });
  };

  const handleSaveEdit = (reasonOverride?: string) => {
    if (!editLine) return;
    const received = parseAmount(editFields.received);
    const dc = parseAmount(editFields.dc);
    const damage = parseAmount(editFields.damage);
    if (received === null || (editFields.dc.trim() !== '' && dc === null) || (editFields.damage.trim() !== '' && damage === null)) {
      setEditError('Quantities must be numbers.');
      return;
    }
    if (dc === null) {
      setEditError('Enter the DC quantity from the delivery challan.');
      return;
    }
    if (received < 0 || (damage ?? 0) < 0 || (dc ?? 0) < 0 || received + (damage ?? 0) <= 0) {
      setEditError('Received quantity must be greater than zero (quantities cannot be negative).');
      return;
    }
    setEditError(null);
    startTransition(async () => {
      try {
        unwrap(await updateGrnItemAction(editLine.id, grn.id, {
          receivedQty: received,
          dcQuantity: dc,
          damageQuantity: damage ?? 0,
          batchNo: editFields.batch || null,
          overReceiptReason: reasonOverride ?? (overReason || null),
        }));
        setEditLine(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'That did not save.';
        setEditError(message);
        if (isOverRefusal(message)) offerOverride((reason) => handleSaveEdit(reason));
      }
    });
  };

  const handleRemove = async (item: GrnItem) => {
    if (!(await askConfirm({ title: 'Remove this line?', message: `${item.poItem.description} will be taken off this GRN.`, confirmLabel: 'Remove', destructive: true }))) return;
    setLineError(null);
    startTransition(async () => {
      try {
        unwrap(await removeGrnItemAction(item.id, grn.id));
      } catch (e) {
        setLineError(e instanceof Error ? e.message : 'That did not save.');
      }
    });
  };

  const router = useRouter();
  const handleDiscard = async () => {
    if (!(await askConfirm({ title: 'Delete this draft GRN?', message: `${grn.grnNumber} and all its lines will be deleted. Nothing has been booked to stock.`, confirmLabel: 'Delete draft', destructive: true }))) return;
    setConfirmError(null);
    startTransition(async () => {
      try {
        unwrap(await discardGrnAction(grn.id));
        router.push('/mis/grn');
      } catch (e) {
        setConfirmError(e instanceof Error ? e.message : 'That did not save.');
      }
    });
  };

  const handleAddItem = (reasonOverride?: string) => {
    if (!selectedPoItemId || !qty) return;
    setItemError(null);
    const received = parseAmount(qty);
    const dc = parseAmount(dcQty);
    const damage = parseAmount(damageQty);
    if (received === null || (dcQty.trim() !== '' && dc === null) || (damageQty.trim() !== '' && damage === null)) {
      setItemError('Quantities must be numbers.');
      return;
    }
    if (dc === null) {
      setItemError('Enter the DC quantity from the delivery challan.');
      return;
    }
    if (received < 0 || (damage ?? 0) < 0 || (dc ?? 0) < 0 || received + (damage ?? 0) <= 0) {
      setItemError('Received quantity must be greater than zero (quantities cannot be negative).');
      return;
    }
    if (type === 'FOR_ORDER' && !orderRef) {
      setItemError('Pick the order this line is for.');
      return;
    }
    startTransition(async () => {
      try {
        unwrap(await addGrnItemAction(grn.id, {
          poItemId: selectedPoItemId,
          receivedQty: received,
          type: type as 'GENERAL' | 'FOR_ORDER',
          forOrderRef: orderRef || null,
          batchNo: batchNo || null,
          dcQuantity: dc,
          damageQuantity: damage ?? 0,
          overReceiptReason: reasonOverride ?? (overReason || null),
        }));
        setSelectedPoItemId(''); setQty(''); setOrderRef(''); setBatchNo(''); setDcQty(''); setDamageQty('');
      } catch (e) {
        const message = e instanceof Error ? e.message : 'That did not save.';
        setItemError(message);
        if (isOverRefusal(message)) offerOverride((reason) => handleAddItem(reason));
      }
    });
  };

  const runConfirm = (reason?: string) => {
    setConfirmError(null);
    startTransition(async () => {
      try {
        const done = unwrap(await confirmGrnAction(grn.id, reason ?? (overReason || null)));
        setWarnings(done?.warnings ?? []);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'That did not save.';
        setConfirmError(message);
        if (isOverRefusal(message)) offerOverride((r) => runConfirm(r));
      }
    });
  };
  const handleConfirm = async () => {
    if (!(await askConfirm({ title: 'Confirm this GRN?', message: 'Confirming this GRN will update inventory and cannot be undone.', confirmLabel: 'Confirm GRN' }))) return;
    // R2-72: paperwork typed but not yet saved must not be lost by confirming.
    if (!(await persistHeader())) { setConfirmError('Fix the delivery paperwork above before confirming.'); return; }
    runConfirm();
  };

  const overrideControl = (message: string | null) =>
    message && isOverRefusal(message) ? (
      <Button variant="secondary" onClick={() => { setOverDraft(overReason); setOverOpen(true); }}>Override with reason</Button>
    ) : null;
  const submitOverride = () => {
    const reason = overDraft.trim();
    if (reason.length < 3) return;
    setOverReason(reason);
    setOverOpen(false);
    retryWithReason.current?.(reason);
    retryWithReason.current = null;
  };

  return (
    <div className="mx-auto max-w-4xl flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{grn.grnNumber}</h1>
            <StatusBadge tone={grn.status === 'CONFIRMED' ? 'good' : grn.status === 'REVERSED' ? 'critical' : 'neutral'}>{grn.status}</StatusBadge>
          </div>
          {grn.status === 'REVERSED' && grn.reverseReason && <p className="mt-1 text-sm text-red-700">Reversed: {grn.reverseReason}</p>}
          <PageBack href="/mis/grn" label="Goods received" />
          <a href={`/mis/print/grn/${grn.id}`} target="_blank" className="text-sm text-blue-600 hover:underline ml-4">🖨 Print GRN</a>
        </div>
        {isDraft && canWrite && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handleDiscard} disabled={isPending}>Delete draft</Button>
            {grn.items.length > 0 && <Button onClick={handleConfirm} disabled={isPending}>Confirm GRN</Button>}
          </div>
        )}
        {grn.status === 'CONFIRMED' && canReverse && (
          <Button variant="ghost" onClick={() => { setReverseReason(''); setReverseError(null); setReverseOpen(true); }} disabled={isPending}>Reverse GRN</Button>
        )}
      </div>
      {/* R2-277: the Owner's reasoned reversal; stock is credited back out and the PO reopens. */}
      <SlideOver open={reverseOpen} onClose={() => setReverseOpen(false)} title="Reverse this GRN">
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">{grn.grnNumber} · every quantity it booked is credited back out of stock, the PO reopens, and the supplier invoice is re-matched. The GRN stays on file as reversed.</p>
          <Input label="Reason (required)" value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} />
          {reverseError && <p role="alert" className="text-sm text-red-600">{reverseError}</p>}
          <div className="flex gap-2 pt-2">
            <Button variant="danger" onClick={runReverse} disabled={isPending || reverseReason.trim().length < 3}>Reverse GRN</Button>
            <Button variant="ghost" onClick={() => setReverseOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
      {/* R2-278: damaged goods are held here, not in stock, until the Owner returns them to the supplier. */}
      {quarantine.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">Quarantine · damaged goods</h2>
          <ul className="divide-y divide-amber-100">
            {quarantine.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-slate-900">{q.itemName} · <span className="font-mono">{q.quantity} {q.unit}</span></span>
                {q.status === 'RETURNED' ? (
                  <span className="text-slate-700">Returned to supplier{q.returnedAt ? ` · ${new Date(q.returnedAt).toLocaleDateString('en-IN')}` : ''}{q.returnNote ? ` · ${q.returnNote}` : ''}</span>
                ) : canReverse ? (
                  <span className="flex items-center gap-2">
                    <Input label="" placeholder="Note (optional)" value={returnNote[q.id] ?? ''} onChange={(e) => setReturnNote({ ...returnNote, [q.id]: e.target.value })} />
                    <Button variant="secondary" onClick={() => runReturn(q.id)} disabled={isPending}>Return to supplier</Button>
                  </span>
                ) : (
                  <span className="text-amber-900">Held · the Owner returns it to the supplier</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {confirmDialog}
      {confirmError && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-red-600">{confirmError}</p>
          {overrideControl(confirmError)}
        </div>
      )}
      {warnings.map((w) => <p key={w} role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{w}</p>)}

      <Card>
        {grn.po && <CardRow label="PO #" value={<Link href={`/mis/po/${grn.po.id}`} className="text-blue-600 hover:underline">{grn.po.poNumber}</Link>} />}
        {grn.po?.supplier && <CardRow label="Supplier" value={grn.po.supplier.name} />}
        {grn.notes && <CardRow label="Notes" value={grn.notes} />}
        {!isDraft && (
          <>
            {grn.supplierInvoiceNo && <CardRow label="Supplier Invoice" value={`${grn.supplierInvoiceNo}${grn.invoiceDate ? ` · ${new Date(grn.invoiceDate).toLocaleDateString('en-IN')}` : ''}`} />}
            {invoiceAmountFormatted && <CardRow label="Invoice Amount" value={invoiceAmountFormatted} />}
            {grn.dcNumber && <CardRow label="DC No" value={grn.dcNumber} />}
            {grn.lrNumber && <CardRow label="LR No" value={grn.lrNumber} />}
            {grn.vehicleNumber && <CardRow label="Vehicle" value={grn.vehicleNumber} />}
            {grn.transporterName && <CardRow label="Transporter" value={grn.transporterName} />}
          </>
        )}
      </Card>

      {isDraft && canWrite && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800">Delivery paperwork</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Supplier Invoice No" value={header.supplierInvoiceNo} onChange={setH('supplierInvoiceNo')} />
            <DateInput label="Invoice Date" value={header.invoiceDate} onChange={setH('invoiceDate')} />
            {canSeeMoney && <NumberInput label="Supplier Invoice Amount (₹)" value={header.supplierInvoiceAmount} onChange={setH('supplierInvoiceAmount')} />}
            <Input label="DC Number" value={header.dcNumber} onChange={setH('dcNumber')} />
            <Input label="LR Number" value={header.lrNumber} onChange={setH('lrNumber')} />
            <Input label="Vehicle Number" value={header.vehicleNumber} onChange={setH('vehicleNumber')} />
            <Input label="Transporter" value={header.transporterName} onChange={setH('transporterName')} />
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleSaveHeader} disabled={isPending}>{isPending ? 'Saving…' : 'Save paperwork'}</Button>
            {headerSaved && <span className="text-sm text-green-700">Saved</span>}
            {headerError && <span role="alert" className="text-sm text-red-600">{headerError}</span>}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold text-slate-800">Items Received</h2>
        {grn.items.length === 0 && <p className="text-sm text-slate-500">No items added yet.</p>}
        {lineError && <p role="alert" className="text-sm text-red-600">{lineError}</p>}
        {grn.items.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-200 p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-slate-800">{item.poItem.description}</div>
                {item.poItem.item && <div className="text-xs text-slate-500">{item.poItem.item.name}</div>}
              </div>
              <StatusBadge tone={item.type === 'FOR_ORDER' ? 'info' : 'neutral'}>{item.type === 'FOR_ORDER' ? 'For Order' : 'General'}</StatusBadge>
            </div>
            <div className="flex gap-6 text-sm text-slate-600">
              <span>Received: <strong>{toNum(item.receivedQty)}</strong></span>
              <span>PO Qty: {toNum(item.poItem.quantity)}</span>
              {item.dcQuantity != null && <span>DC: {item.dcQuantity}</span>}
              {!!item.damageQuantity && <span className="text-amber-700">Damaged: {item.damageQuantity}</span>}
              {item.shortQuantity != null && item.shortQuantity > 0 && <span className="text-red-700">Short: {item.shortQuantity}</span>}
              {item.batchNo && <span>Batch: {item.batchNo}</span>}
              {item.forOrderRef && <span>Order Ref: {item.forOrderRef}</span>}
            </div>
            {isDraft && canWrite && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => openEdit(item)} disabled={isPending}>Edit</Button>
                <Button variant="ghost" onClick={() => handleRemove(item)} disabled={isPending}>Remove</Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {isDraft && canWrite && availablePoItems.length > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800">Add Item</h2>
          <Select
            label="PO Line Item"
            value={selectedPoItemId}
            onChange={setSelectedPoItemId}
            options={[{ value: '', label: '— Select item —' }, ...availablePoItems.map(i => ({ value: i.id, label: `${i.description} (Ordered: ${toNum(i.quantity)} · remaining ${remainingOf(i)})` }))]}
          />
          <NumberInput label="Received Qty (good)" value={qty} onChange={e => setQty(e.target.value)} min="0.01" step="0.01" />
          <div className="grid grid-cols-2 gap-3">
            <NumberInput label="DC Qty (challan) *" value={dcQty} onChange={e => setDcQty(e.target.value)} min="0" step="0.01" />
            <NumberInput label="Damaged Qty" value={damageQty} onChange={e => setDamageQty(e.target.value)} min="0" step="0.01" />
          </div>
          {dcQty && <p className="text-xs text-slate-500">Short = {dcQty} − ({qty || 0} + {damageQty || 0}) = <strong>{Math.round(((parseFloat(dcQty) || 0) - (parseFloat(qty) || 0) - (parseFloat(damageQty) || 0)) * 100) / 100}</strong></p>}
          {itemError && (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-red-600">{itemError}</p>
              {overrideControl(itemError)}
            </div>
          )}
          <Select
            label="Type"
            value={type}
            onChange={setType}
            options={[{ value: 'GENERAL', label: 'General Stock' }, { value: 'FOR_ORDER', label: 'For Specific Order' }]}
          />
          {type === 'FOR_ORDER' && (
            <Select
              label="Order Reference"
              value={orderRef}
              onChange={setOrderRef}
              options={[{ value: '', label: '— Select order —' }, ...orders.map(o => ({ value: o.orderNumber, label: `${o.orderNumber}${o.customerName ? ` — ${o.customerName}` : ''}` }))]}
            />
          )}
          <Input label="Batch No" value={batchNo} onChange={e => setBatchNo(e.target.value)} />
          <div>
            <Button onClick={() => handleAddItem()} disabled={isPending || !selectedPoItemId || !qty}>{isPending ? 'Adding…' : 'Add Item'}</Button>
          </div>
        </div>
      )}

      <SlideOver open={editLine !== null} onClose={() => setEditLine(null)} title="Edit line">
        {editLine && (
          <div className="flex flex-col gap-4 p-4">
            <div className="font-medium text-slate-800">{editLine.poItem.description}</div>
            <NumberInput label="Received Qty (good)" value={editFields.received} onChange={e => setEditFields({ ...editFields, received: e.target.value })} min="0.01" step="0.01" />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="DC Qty (challan) *" value={editFields.dc} onChange={e => setEditFields({ ...editFields, dc: e.target.value })} />
              <NumberInput label="Damaged Qty" value={editFields.damage} onChange={e => setEditFields({ ...editFields, damage: e.target.value })} />
            </div>
            <Input label="Batch No" value={editFields.batch} onChange={e => setEditFields({ ...editFields, batch: e.target.value })} />
            {editError && (
              <div className="flex flex-col gap-2">
                <p role="alert" className="text-sm text-red-600">{editError}</p>
                {overrideControl(editError)}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => handleSaveEdit()} disabled={isPending || !editFields.received}>{isPending ? 'Saving…' : 'Save line'}</Button>
              <Button variant="ghost" onClick={() => setEditLine(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </SlideOver>

      <SlideOver open={overOpen} onClose={() => setOverOpen(false)} title="Override the 2% limit">
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">This delivery is more than the order plus 2%. Give a reason; it is recorded against the GRN.</p>
          <Input label="Reason" value={overDraft} onChange={(e) => setOverDraft(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={submitOverride} disabled={overDraft.trim().length < 3}>Override and retry</Button>
            <Button variant="ghost" onClick={() => setOverOpen(false)}>Cancel</Button>
          </div>
        </div>
      </SlideOver>
    </div>
  );
}
