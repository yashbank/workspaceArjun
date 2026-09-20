'use client';

import { useState } from 'react';

import type { KioskCardData, KioskCardDevice, KioskHealthLevel } from '@/lib/mis/kiosk-health';
import { cn } from '@/lib/utils';

import {
  AlertRow,
  BigStat,
  Chip,
  DashedCard,
  EmptyNote,
  HeaderCard,
  HomeStack,
  InfoCard,
  Mono,
  OkCard,
  PrimaryButton,
  SecondaryButton,
  SectionLabel,
  WarnCard,
  FailCard,
} from './cards';

export type AttendanceHomeProps = {
  header: { title: string; meta: string };
  /** SUPER_ATTENDANCE_OPERATOR gets the two correction cards; the plain operator does not. */
  isSuper: boolean;
  kiosk: { lastPunch: string | null; punchesToday: number; health: KioskCardData };
  today: {
    present: number;
    headcount: number;
    late: number;
    onLeave: number;
    absent: number;
    recorded: boolean;
  };
  forgotClockOut: { label: string; people: { id: string; name: string; detail: string }[] };
  lateArrivals: { id: string; name: string; employeeCode: string; detail: string }[];
  corrections: { label: string; days: number } | null;
};

export function AttendanceHome({
  header,
  isSuper,
  kiosk,
  today,
  forgotClockOut,
  lateArrivals,
  corrections,
}: AttendanceHomeProps) {
  return (
    <HomeStack>
      <HeaderCard title={header.title} meta={header.meta} />

      <KioskHealthCard kiosk={kiosk} />

      <InfoCard>
        <SectionLabel>Clocked in today</SectionLabel>
        <div className="mt-2">
          {today.recorded ? (
            <>
              <BigStat value={today.present} total={today.headcount} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip tone="risk">{today.late} late</Chip>
                <Chip tone="neutral">{today.onLeave} on leave</Chip>
                <Chip tone="bad">{today.absent} absent</Chip>
              </div>
            </>
          ) : (
            <EmptyNote>Nothing has been entered on today’s register yet.</EmptyNote>
          )}
        </div>
      </InfoCard>

      {forgotClockOut.people.length > 0 && (
        <WarnCard>
          <SectionLabel>Open clock-outs</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">
            {forgotClockOut.people.length} forgot to clock out {forgotClockOut.label}
          </p>
          <div className="mb-3">
            {forgotClockOut.people.map((p) => (
              <AlertRow key={p.id} tone="risk" title={p.name} detail={p.detail} />
            ))}
          </div>
          <SecondaryButton href="/mis/attendance">Close them out</SecondaryButton>
        </WarnCard>
      )}

      <InfoCard>
        <SectionLabel>Late this morning</SectionLabel>
        <div className="mt-1">
          {lateArrivals.length === 0 ? (
            <EmptyNote>Nobody clocked in late today.</EmptyNote>
          ) : (
            lateArrivals.map((p) => (
              <AlertRow
                key={p.id}
                tone="risk"
                title={`${p.name} · ${p.employeeCode}`}
                detail={p.detail}
              />
            ))
          )}
        </div>
      </InfoCard>

      {isSuper && corrections && (
        <DashedCard>
          <SectionLabel>Corrections open</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">{corrections.label}</p>
          <p className="mb-3 text-sm text-slate-600">
            <Mono>{corrections.days} days back</Mono> — nothing older can be edited.
          </p>
          <PrimaryButton href="/mis/attendance">Open corrections</PrimaryButton>
        </DashedCard>
      )}

      {isSuper && <WaiveLatenessCard lateCount={today.late} />}
    </HomeStack>
  );
}

/**
 * Waive today's lateness.
 *
 * The toggle and the reason note are local state. There is no waiver mutation
 * in the server layer yet, so the card carries the reason to the register
 * rather than pretending to have saved it — a button that silently does
 * nothing is worse than one that hands the work over.
 */
function WaiveLatenessCard({ lateCount }: { lateCount: number }) {
  const [on, setOn] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <DashedCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SectionLabel>Waive today’s lateness</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">
            {lateCount} late {lateCount === 1 ? 'punch' : 'punches'} today
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Waive today’s lateness"
          onClick={() => setOn((v) => !v)}
          className={cn(
            'mt-0.5 h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors',
            on ? 'bg-indigo-600' : 'bg-slate-300',
          )}
        >
          <span
            className={cn(
              'block h-6 w-6 rounded-full bg-white shadow-sm transition-transform',
              on && 'translate-x-5',
            )}
          />
        </button>
      </div>

      {on && (
        <div className="mt-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why — a bus strike, a power cut, a festival"
            className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 placeholder:text-slate-400"
          />
          <p className="mb-3 mt-1 text-xs text-slate-500">
            A waiver needs a reason on the record. Apply it on the register.
          </p>
          <PrimaryButton href="/mis/attendance">Apply on the register</PrimaryButton>
        </div>
      )}
    </DashedCard>
  );
}

const KIOSK_TITLE: Record<KioskHealthLevel, string> = {
  GREEN: 'Gate kiosk online',
  AMBER: 'Gate kiosk quiet',
  RED: 'Gate kiosk not syncing',
};

/**
 * "Did everyone get recorded, and is the kiosk alive?" (R5). Green with a
 * timestamp is the only proof the tablet is syncing, so the age is always
 * printed in words — and the colour is never the only signal: the title changes
 * too. The worst tablet decides the card (D19).
 */
function KioskHealthCard({ kiosk }: { kiosk: AttendanceHomeProps['kiosk'] }) {
  const { health } = kiosk;
  const lastPunch = kiosk.lastPunch
    ? `Last punch ${kiosk.lastPunch} · ${kiosk.punchesToday} recorded today`
    : 'No punches recorded today';

  if (health.level === null) {
    return (
      <DashedCard>
        <SectionLabel>Gate kiosk</SectionLabel>
        <p className="mt-1 font-semibold text-slate-900">No gate tablet is paired</p>
        <p className="text-sm text-slate-600">
          Ask an Admin to pair one in Settings → Gate tablets. {lastPunch}.
        </p>
      </DashedCard>
    );
  }

  const Shell = health.level === 'GREEN' ? OkCard : health.level === 'AMBER' ? WarnCard : FailCard;
  return (
    <Shell>
      <SectionLabel>Gate kiosk</SectionLabel>
      <p className="mt-1 font-semibold text-slate-900">{KIOSK_TITLE[health.level]}</p>
      <div className="mt-1 flex flex-col gap-1">
        {health.devices.map((d) => (
          <KioskDeviceLine key={d.id} device={d} showName={health.devices.length > 1} />
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-500">{lastPunch}</p>
    </Shell>
  );
}

function KioskDeviceLine({ device, showName }: { device: KioskCardDevice; showName: boolean }) {
  return (
    <div>
      <p className="text-sm text-slate-700">
        {showName && <span className="font-medium">{device.name} · </span>}
        {device.syncedAgo === 'never' ? 'Never synced' : `Synced ${device.syncedAgo} ago`} · {device.queued}
      </p>
      {device.batteryWarning && (
        <p className="text-sm font-medium text-amber-900">{device.batteryWarning}</p>
      )}
    </div>
  );
}
