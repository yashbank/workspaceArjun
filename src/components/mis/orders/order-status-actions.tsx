'use client';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { Input } from '@/components/mis/kit/input';
import { SlideOver } from '@/components/mis/kit/slide-over';
import { updateOrderStatusAction } from '@/app/(mis)/mis/orders/actions';
import { MIN_REASON_LENGTH, type CloseGate } from '@/lib/mis/order-transitions';
import { fmtDateTime } from '@/lib/mis/client-dates';

type Props = {
  orderId: string;
  orderNumber: string;
  status: string;
  /** Close gates, only fetched while the order can still be completed. */
  gates: CloseGate[];
  /** OWNER/ADMIN: may complete past unmet gates with a reason. */
  canOverride: boolean;
  /** Last "completed past unmet gates" override, shown on the order. */
  override: { reason: string; at: Date } | null;
};

type Panel = null | 'complete' | 'cancel';

/**
 * Close / deliver / cancel an order. Shared by the phone detail screen and the D4 desktop twin
 * so the two cannot drift. The caller renders it only for roles holding `orders.write`; the
 * server re-checks everything (transition table, gates, override role).
 *
 * "Mark complete" is offered on IN_PRODUCTION only: the transition table has no
 * CONFIRMED -> COMPLETED move, so a CONFIRMED order gets "Start production" instead.
 */
export function OrderStatusActions({ orderId, orderNumber, status, gates: initialGates, canOverride, override }: Props) {
  // The server is the authority on the gates: a refusal carries the fresh list, which replaces
  // what the page loaded (it may have gone stale) and reveals the override field.
  const [freshGates, setFreshGates] = useState<CloseGate[] | null>(null);
  const gates = freshGates ?? initialGates;
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const unmet = gates.filter((g) => !g.passed);
  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH;

  const close = () => { setPanel(null); setFreshGates(null); setReason(''); setError(null); };
  const run = (next: string, why?: string, done?: () => void) => start(async () => {
    setError(null);
    const result = await updateOrderStatusAction(orderId, next, why);
    if (result.ok) { (done ?? close)(); } else {
      setError(result.detail);
      if (result.gates) setFreshGates(result.gates);
    }
  });

  const btn = 'inline-flex min-h-11 items-center rounded-lg border bg-white px-3 text-sm font-semibold hover:bg-slate-50';

  return (
    <>
      {status === 'CONFIRMED' && (
        <button type="button" disabled={pending} onClick={() => run('IN_PRODUCTION', undefined, () => setError(null))} className={`${btn} border-slate-300 text-slate-800`}>
          Start production
        </button>
      )}
      {status === 'IN_PRODUCTION' && (
        <button type="button" onClick={() => setPanel('complete')} className={`${btn} border-green-300 text-green-900`}>
          Mark complete
        </button>
      )}
      {status === 'COMPLETED' && (
        <button type="button" disabled={pending} onClick={() => run('DELIVERED', undefined, () => setError(null))} className={`${btn} border-green-300 text-green-900`}>
          Mark delivered
        </button>
      )}
      {(status === 'DRAFT' || status === 'CONFIRMED' || status === 'IN_PRODUCTION') && (
        <button type="button" onClick={() => setPanel('cancel')} className={`${btn} border-red-300 text-red-800`}>
          Cancel order
        </button>
      )}
      {error && panel === null && <p role="alert" className="basis-full text-sm font-semibold text-amber-900">{error}</p>}
      {override && (status === 'COMPLETED' || status === 'DELIVERED') && (
        <p className="basis-full text-sm text-amber-800">
          Completed past unmet gates on {fmtDateTime(override.at)}: {override.reason}
        </p>
      )}

      <SlideOver open={panel === 'complete'} onClose={close} title="Mark complete">
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">{orderNumber}</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {gates.map((g) => (
              <li key={g.key} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <span aria-hidden="true" className={g.passed ? 'font-bold text-green-700' : 'font-bold text-red-700'}>{g.passed ? '✓' : '✗'}</span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{g.label} <span className="sr-only">{g.passed ? 'passed' : 'not met'}</span></span>
                  {!g.passed && <span className="block text-xs text-red-700">{g.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          {unmet.length > 0 && (canOverride ? (
            <Input label="Override reason (required to complete anyway)" value={reason} onChange={(e) => setReason(e.target.value)} />
          ) : (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              This order cannot be completed until the gates above are met. An owner or admin can override.
            </p>
          ))}
          {error && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{error}</div>}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => run('COMPLETED', unmet.length > 0 ? reason : undefined)}
              disabled={pending || (unmet.length > 0 && (!canOverride || !reasonOk))}
            >
              {unmet.length > 0 ? 'Complete anyway' : 'Mark complete'}
            </Button>
            <Button variant="ghost" onClick={close}>Close</Button>
          </div>
        </div>
      </SlideOver>

      <SlideOver open={panel === 'cancel'} onClose={close} title="Cancel order">
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-slate-600">{orderNumber}</p>
          <Input label="Why is this order being cancelled?" value={reason} onChange={(e) => setReason(e.target.value)} />
          {error && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{error}</div>}
          <div className="flex gap-2 pt-2">
            <Button variant="danger" onClick={() => run('CANCELLED', reason)} disabled={pending || !reasonOk}>Cancel order</Button>
            <Button variant="ghost" onClick={close}>Keep order</Button>
          </div>
        </div>
      </SlideOver>
    </>
  );
}
