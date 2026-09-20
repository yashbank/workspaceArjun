'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { useT } from '@/components/mis/shell/locale-provider';

import {
  acknowledgeQcFailureAction,
  setWasteReasonAction,
  signOffPhaseAction,
} from '@/app/(mis)/mis/production/sign-off/[phaseId]/actions';

type Blocker =
  | { kind: 'NO_PRODUCTION' }
  | { kind: 'WASTE_REASON'; logId: string; loggedAt: string; qtyWaste: number }
  | { kind: 'QC_FAILURE'; checkId: string; parameterName: string | null; checkTime: string };

export type SignOffScreenProps = {
  phaseId: string;
  processName: string;
  orderId: string;
  orderNumber: string;
  status: string;
  inChargeName: string | null;
  canSign: boolean;
  output: number;
  waste: number;
  wastePercent: number | null;
  entries: number;
  unit: string;
  handedOver: { processName: string; output: number } | null;
  materials: { description: string; quantity: number; unit: string }[];
  blockers: Blocker[];
};

const num = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });

/**
 * The sign-off screen.
 *
 * The summary sits above the confirm action and always will (MIS-164). This is
 * the one moment anybody looks at the phase as a whole, and it is where a wrong
 * figure gets caught; a confirm button above the numbers turns a check back
 * into a habit.
 */
export function SignOffScreen(props: SignOffScreenProps) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const wasteBlockers = props.blockers.filter((b) => b.kind === 'WASTE_REASON');
  const qcBlockers = props.blockers.filter((b) => b.kind === 'QC_FAILURE');
  const noProduction = props.blockers.some((b) => b.kind === 'NO_PRODUCTION');

  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not work.');
      }
    });

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3 pb-24">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {t('phase.signOff.title')}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{props.processName}</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">
          {props.orderNumber} · {t(`phase.status.${props.status}` as 'phase.status.PENDING')}
        </p>
        {props.inChargeName && (
          <p className="mt-2 text-sm text-slate-600">
            {t('phase.inCharge')}: <span className="font-semibold text-slate-900">{props.inChargeName}</span>
          </p>
        )}
      </section>

      {/* ---- The summary. Everything below this is what the signature claims. ---- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {t('phase.signOff.whatYouAreSigning')}
        </p>

        <div className="mt-3">
          <p className="text-4xl font-bold leading-none text-slate-900">
            {num(props.output)}
            {props.handedOver && (
              <span className="text-lg font-bold text-slate-400">/{num(props.handedOver.output)}</span>
            )}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t('phase.summary.output')} ({props.unit})
            {props.handedOver && ` · ${t('phase.summary.handedOver')}: ${props.handedOver.processName}`}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <span className="block text-2xl font-bold leading-none text-amber-800">{num(props.waste)}</span>
            <span className="mt-1 block text-[11px] font-medium text-amber-800/80">
              {t('phase.summary.waste')}
              {props.wastePercent != null && ` · ${props.wastePercent.toFixed(1)}%`}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
            <span className="block text-2xl font-bold leading-none text-slate-900">{props.entries}</span>
            <span className="mt-1 block text-[11px] font-medium text-slate-500">
              {t('phase.summary.entries')}
            </span>
          </div>
        </div>

        {props.materials.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {t('phase.summary.materials')}
            </p>
            <ul className="mt-1 flex flex-col gap-1">
              {props.materials.map((m) => (
                <li key={m.description} className="flex justify-between gap-3 text-sm text-slate-600">
                  <span className="truncate">{m.description}</span>
                  <span className="shrink-0 font-mono text-xs text-slate-500">
                    {num(m.quantity)} {m.unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---- What is in the way, each with the action that clears it ---- */}
      {noProduction && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-slate-900">{t('phase.blocker.noProduction')}</p>
        </section>
      )}

      {wasteBlockers.map((blocker) => (
        <WasteReasonCard
          key={blocker.logId}
          blocker={blocker}
          unit={props.unit}
          disabled={isPending}
          onSave={(reason) => run(() => setWasteReasonAction(blocker.logId, reason, props.phaseId))}
        />
      ))}

      {qcBlockers.map((blocker) => (
        <QcFailureCard
          key={blocker.checkId}
          blocker={blocker}
          disabled={isPending}
          onAcknowledge={(note) =>
            run(() => acknowledgeQcFailureAction(blocker.checkId, note, props.phaseId))
          }
        />
      ))}

      {error && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-900">{error}</p>
        </section>
      )}

      {/* ---- The confirm action. Below the numbers, always. ---- */}
      {props.canSign ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => signOffPhaseAction(props.phaseId, props.orderId))}
          className="w-full rounded-xl bg-indigo-600 py-3.5 text-base font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {isPending ? t('phase.signOff.signing') : t('phase.signOff.confirm')}
        </button>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            {props.inChargeName
              ? `${t('phase.signOff.notInCharge')} ${props.inChargeName}.`
              : t('phase.signOff.notInCharge')}
          </p>
        </section>
      )}

      <Link
        href={`/mis/orders/${props.orderId}`}
        className="block w-full rounded-xl border border-slate-200 bg-white py-3 text-center font-semibold text-slate-700"
      >
        {props.orderNumber}
      </Link>
    </div>
  );
}

function WasteReasonCard({
  blocker,
  unit,
  disabled,
  onSave,
}: {
  blocker: Extract<Blocker, { kind: 'WASTE_REASON' }>;
  unit: string;
  disabled: boolean;
  onSave: (reason: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState('');
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800/80">
        {t('phase.blocker.wasteReason')}
      </p>
      <p className="mt-1 font-semibold text-slate-900">
        {num(blocker.qtyWaste)} {unit} · {new Date(blocker.loggedAt).toLocaleString('en-IN')}
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t('phase.action.reasonPlaceholder')}
        className="mt-2 h-12 w-full rounded-xl border border-amber-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400"
      />
      <button
        type="button"
        disabled={disabled || !reason.trim()}
        onClick={() => onSave(reason)}
        className="mt-2 w-full rounded-xl border border-amber-300 bg-white py-3 font-semibold text-amber-900 disabled:opacity-60"
      >
        {t('phase.action.saveReason')}
      </button>
    </section>
  );
}

function QcFailureCard({
  blocker,
  disabled,
  onAcknowledge,
}: {
  blocker: Extract<Blocker, { kind: 'QC_FAILURE' }>;
  disabled: boolean;
  onAcknowledge: (note: string) => void;
}) {
  const t = useT();
  const [note, setNote] = useState('');
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-red-800/80">
        {t('phase.blocker.qcFailure')}
      </p>
      <p className="mt-1 font-semibold text-slate-900">
        {blocker.parameterName ?? 'Quality check'} · {new Date(blocker.checkTime).toLocaleString('en-IN')}
      </p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('phase.action.acknowledgeNote')}
        className="mt-2 h-12 w-full rounded-xl border border-red-300 bg-white px-3 text-base text-slate-900 placeholder:text-slate-400"
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAcknowledge(note)}
        className="mt-2 w-full rounded-xl border border-red-300 bg-white py-3 font-semibold text-red-900 disabled:opacity-60"
      >
        {t('phase.action.acknowledge')}
      </button>
    </section>
  );
}
