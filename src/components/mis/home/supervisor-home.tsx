'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { clearLineAction } from '@/app/(mis)/mis/production/actions';
import { PendingSyncNote } from '@/components/mis/shell/pending-sync-note';

import {
  BigStat,
  Chip,
  EmptyNote,
  HeaderCard,
  HomeStack,
  InfoCard,
  Mono,
  PrimaryButton,
  RowLink,
  SecondaryButton,
  SectionLabel,
  StatTrio,
  WarnCard,
} from './cards';

export type SupervisorHomeProps = {
  header: { title: string; meta: string };
  clearanceBlocker: {
    machineId: string;
    machineName: string;
    orderId: string;
    orderNumber: string;
  } | null;
  blocker: {
    orderId: string;
    orderNumber: string;
    parameterName: string;
    defectType: string | null;
    since: string;
  } | null;
  machines: { free: number; running: number; down: number; total: number };
  /**
   * Phases this person is the in-charge of and has not signed (MIS-164). Until
   * Phase 7 this card showed attendance clock-out approvals, which are a
   * different thing that happened to fit the same slot.
   */
  signOff: {
    total: number;
    rows: { id: string; processName: string; orderNumber: string; detail: string }[];
  };
  crew: { present: number; headcount: number; absent: number; onLeave: number; recorded: boolean };
};

/**
 * The supervisor home.
 *
 * Recording production is the single thing this person does most, so it is a
 * button at the top rather than a tab two taps away — everything below it is
 * there to answer "what is stopping me".
 */
export function SupervisorHome({ header, clearanceBlocker, blocker, machines, signOff, crew }: SupervisorHomeProps) {
  const [isClearing, startClearing] = useTransition();
  const [clearError, setClearError] = useState<string | null>(null);

  const handleClear = () => {
    if (!clearanceBlocker) return;
    startClearing(async () => {
      setClearError(null);
      const result = await clearLineAction({ machineId: clearanceBlocker.machineId, orderId: clearanceBlocker.orderId });
      // A refusal comes back as a value, never a throw: in a production build a
      // thrown error reaches the browser as a generic string (Appendix B §B.10.3).
      if (!result.ok) setClearError(result.detail);
    });
  };

  return (
    <HomeStack>
      <HeaderCard title={header.title} meta={header.meta} />

      <PrimaryButton href="/mis/production">+ Record production</PrimaryButton>

      {/* What is still on this device — the count belongs here, at the button that
          made the entry, as well as in the header (MIS-155). Empty renders nothing. */}
      <PendingSyncNote />

      {clearanceBlocker ? (
        <WarnCard>
          <SectionLabel>Line clearance needed</SectionLabel>
          <p className="mb-3 mt-1 font-semibold text-slate-900">
            {clearanceBlocker.machineName} · {clearanceBlocker.orderNumber} cannot start
          </p>
          <SecondaryButton onClick={handleClear} className={isClearing ? 'opacity-60' : undefined}>
            Clear the line
          </SecondaryButton>
          {clearError && <p className="mt-2 text-sm font-semibold text-amber-900">{clearError}</p>}
        </WarnCard>
      ) : (
        blocker && (
          <WarnCard>
            <SectionLabel>Quality hold</SectionLabel>
            <p className="mt-1 font-semibold text-slate-900">
              {blocker.orderNumber} failed {blocker.parameterName}
            </p>
            <p className="mb-3 text-sm text-slate-600">
              {blocker.defectType ? `${blocker.defectType} · ` : ''}
              {blocker.since}. The line stays down until this is cleared.
            </p>
            <SecondaryButton href={`/mis/qc/${blocker.orderId}`}>Open the check</SecondaryButton>
          </WarnCard>
        )
      )}

      <InfoCard>
        <div className="mb-2 flex items-center justify-between gap-2">
          <SectionLabel>My machines</SectionLabel>
          <Link href="/mis/machine-board" className="text-xs font-semibold text-indigo-600">
            All {machines.total} visible
          </Link>
        </div>
        {machines.total === 0 ? (
          <EmptyNote>No machines have been added to the masters yet.</EmptyNote>
        ) : (
          <StatTrio
            items={[
              { value: machines.free, label: 'Free', tone: 'ok', href: '/mis/machine-board' },
              { value: machines.running, label: 'Running', tone: 'risk', href: '/mis/machine-board' },
              { value: machines.down, label: 'Down', tone: 'bad', href: '/mis/machine-board' },
            ]}
          />
        )}
      </InfoCard>

      <InfoCard>
        <div className="mb-1 flex items-center justify-between gap-2">
          <SectionLabel>Waiting on your sign-off</SectionLabel>
          {signOff.total > 0 && <Chip tone="action">{signOff.total}</Chip>}
        </div>
        {signOff.rows.length === 0 ? (
          <EmptyNote>Nothing is waiting on your sign-off.</EmptyNote>
        ) : (
          signOff.rows.map((row) => (
            <RowLink
              key={row.id}
              href={`/mis/production/sign-off/${row.id}`}
              title={
                <>
                  {row.processName} <Mono>{row.orderNumber}</Mono>
                </>
              }
              detail={row.detail}
              right={<Chip tone="action">Sign off</Chip>}
            />
          ))
        )}
      </InfoCard>

      <InfoCard>
        <SectionLabel>My crew today</SectionLabel>
        <div className="mt-2">
          {crew.recorded ? (
            <>
              <BigStat value={crew.present} total={crew.headcount} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip tone="bad">{crew.absent} absent</Chip>
                <Chip tone="neutral">{crew.onLeave} on leave</Chip>
              </div>
            </>
          ) : (
            <EmptyNote>Nothing has been entered on today’s register yet.</EmptyNote>
          )}
        </div>
      </InfoCard>
    </HomeStack>
  );
}
