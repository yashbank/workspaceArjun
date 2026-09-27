'use client';
import { useState, useTransition } from 'react';

import { discardParkedWriteAction, resolveParkedWriteAction } from '@/app/(mis)/mis/queue/actions';
import { Button } from '@/components/mis/kit/button';
import { EmptyState } from '@/components/mis/kit/empty-state';
import { Input } from '@/components/mis/kit/input';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { isRetryablePark } from '@/lib/mis/offline/idempotency';

export type ParkedWriteRow = {
  key: string;
  kind: 'production.log' | 'production.waste_reason' | 'attendance.punch_in' | 'attendance.punch_out';
  status: 'PARKED' | 'REJECTED';
  payload: unknown;
  parkReason: string | null;
  parkDetail: string | null;
  clientRecordedAt: Date | null;
  deviceId: string | null;
  actorId: string | null;
  attempts: number;
  firstSeenAt: Date;
  lastAttemptAt: Date | null;
};

type Props = {
  rows: ParkedWriteRow[];
  /** Whether the clearance in force right now is present, keyed by row key (§B.5.1). Only set for
   * CLEARANCE_EXPIRED/CLEARANCE_MISSING rows whose payload named a machine. */
  clearanceNow: Record<string, boolean>;
  canClearanceOverride: boolean;
  canAttendanceOverride: boolean;
};

const KIND_LABEL: Record<ParkedWriteRow['kind'], string> = {
  'production.log': 'Production log',
  'production.waste_reason': 'Waste reason',
  'attendance.punch_in': 'Punch in',
  'attendance.punch_out': 'Punch out',
};

const REASON_LABEL: Record<string, string> = {
  ORDER_CLOSED: 'Order closed in the meantime',
  PHASE_SIGNED_OFF: 'Phase signed off in the meantime',
  PHASE_NOT_ACTIVE: 'Phase not active',
  PHASE_AMBIGUOUS: 'Phase ambiguous',
  FORBIDDEN: 'Permission changed in the meantime',
  UNKNOWN: 'An unexpected failure',
  CLEARANCE_EXPIRED: 'Line clearance expired in the meantime',
  CLEARANCE_MISSING: 'No line clearance on file',
  CLOCK_SKEW: "The device's clock is outside tolerance",
  TOO_OLD: 'Past the queue age limit',
  BADGE_UNKNOWN: 'Badge not recognised',
  EMPLOYEE_INACTIVE: 'Employee is off the active roll',
  CORRECTION_WINDOW_CLOSED: 'Past the correction window',
  MACHINE_MISSING: 'No machine named',
  MALFORMED: 'The entry itself is invalid',
  BAD_KEY: 'Invalid idempotency key',
};

const CLEARANCE_REASONS = new Set(['CLEARANCE_EXPIRED', 'CLEARANCE_MISSING']);
const ATTENDANCE_OVERRIDE_REASONS = new Set(['CLOCK_SKEW', 'TOO_OLD', 'EMPLOYEE_INACTIVE', 'CORRECTION_WINDOW_CLOSED']);

/** Can this reason be resolved from the inbox at all — by ANYONE, permission aside? */
function isResolvable(reason: string | null): boolean {
  if (!reason) return false;
  return isRetryablePark(reason) || CLEARANCE_REASONS.has(reason) || ATTENDANCE_OVERRIDE_REASONS.has(reason);
}

export function ParkedWritesScreen({ rows, clearanceNow, canClearanceOverride, canAttendanceOverride }: Props) {
  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="mb-6 text-2xl font-semibold text-slate-900">Parked writes</h1>
        <EmptyState
          title="Nothing is stuck"
          body="Every write from every tablet and the portal has landed. When one parks — a device nobody is holding, a clearance that expired, a closed order — it shows up here."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Parked writes</h1>
        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-bold text-red-700">{rows.length}</span>
      </div>
      <div className="flex flex-col gap-4">
        {rows.map((row) => {
          const canResolve =
            row.status === 'PARKED' &&
            isResolvable(row.parkReason) &&
            (isRetryablePark(row.parkReason)
              ? true
              : CLEARANCE_REASONS.has(row.parkReason ?? '')
                ? canClearanceOverride
                : canAttendanceOverride);
          return (
            <ParkedWriteCard
              key={row.key}
              row={row}
              clearedNow={clearanceNow[row.key]}
              canResolve={canResolve}
            />
          );
        })}
      </div>
    </div>
  );
}

function payloadSummary(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '—';
  const p = payload as Record<string, unknown>;
  return Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');
}

function fmt(d: Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function ParkedWriteCard({
  row,
  clearedNow,
  canResolve,
}: {
  row: ParkedWriteRow;
  clearedNow: boolean | undefined;
  canResolve: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const resolve = () => {
    if (note.trim().length < 3) {
      setMessage('Write a reason of at least three characters first.');
      return;
    }
    startTransition(async () => {
      const outcome = await resolveParkedWriteAction(row.key, note);
      if (outcome.outcome === 'APPLIED' || outcome.outcome === 'DUPLICATE') {
        setMessage(null); // the row disappears on revalidate — nothing more to say
      } else {
        setMessage(`Still stuck: ${REASON_LABEL[outcome.reason ?? ''] ?? outcome.reason ?? outcome.outcome}. ${outcome.detail ?? ''}`);
      }
    });
  };

  const discard = () => {
    if (note.trim().length < 3) {
      setMessage('Write a reason of at least three characters first.');
      return;
    }
    startTransition(async () => {
      await discardParkedWriteAction(row.key, note);
    });
  };

  const isRejected = row.status === 'REJECTED';

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusBadge tone={isRejected ? 'critical' : 'warning'}>{isRejected ? 'Rejected' : 'Parked'}</StatusBadge>
        <span className="font-medium text-slate-900">{KIND_LABEL[row.kind]}</span>
        <span className="text-sm text-slate-500">{REASON_LABEL[row.parkReason ?? ''] ?? row.parkReason ?? 'No reason recorded'}</span>
      </div>

      <p className="mb-3 text-sm text-slate-600">{row.parkDetail ?? 'No further detail was recorded.'}</p>

      <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500 sm:grid-cols-4">
        <div><dt className="font-medium">Recorded</dt><dd>{fmt(row.clientRecordedAt)}</dd></div>
        <div><dt className="font-medium">First seen</dt><dd>{fmt(row.firstSeenAt)}</dd></div>
        <div><dt className="font-medium">Device</dt><dd>{row.deviceId ?? 'Portal'}</dd></div>
        <div><dt className="font-medium">Attempts</dt><dd>{row.attempts}</dd></div>
      </dl>

      <p className="mb-3 text-xs text-slate-500">Payload: {payloadSummary(row.payload)}</p>

      {clearedNow !== undefined && (
        <p className="mb-3 text-xs">
          <span className="font-medium text-slate-700">Then: </span>
          <span className="text-slate-500">{row.parkDetail}</span>
          <span className="mx-2 text-slate-300">·</span>
          <span className="font-medium text-slate-700">Now: </span>
          <span className={clearedNow ? 'text-emerald-700' : 'text-red-700'}>{clearedNow ? 'Cleared' : 'Not cleared'}</span>
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Input
            label="Reason"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this is being resolved or discarded"
            disabled={isPending}
          />
        </div>
        <div className="flex gap-2">
          {canResolve && (
            <Button onClick={resolve} disabled={isPending}>Resolve</Button>
          )}
          <Button variant="secondary" onClick={discard} disabled={isPending}>Discard</Button>
        </div>
      </div>
      {message && <p className="mt-2 text-sm text-amber-700">{message}</p>}
    </div>
  );
}
