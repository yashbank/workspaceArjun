'use client';

import {
  ActionCard,
  AlertRow,
  ApprovalRow,
  BigStat,
  CheckIcon,
  CountBadge,
  Divider,
  EmptyNote,
  FailCard,
  HeaderCard,
  HomeStack,
  InfoCard,
  Mono,
  MoneyCard,
  OkCard,
  PrimaryButton,
  SectionLabel,
  StatTrio,
  WarnCard,
  type AlertTone,
} from './cards';

export type OwnerAlert = {
  id: string;
  tone: AlertTone;
  title: string;
  detail: string;
  href?: string;
};

export type OwnerHomeProps = {
  header: { title: string; meta: string };
  approvals: {
    total: number;
    /** `age` is omitted when a row has no dated origin to measure from. */
    rows: { id: string; title: string; detail: string; age?: string }[];
  };
  alerts: OwnerAlert[];
  yesterday: {
    label: string;
    produced: number;
    waste: number;
    machinesRun: number;
    recorded: boolean;
  };
  wages: { monthLabel: string; gross: number; ot: number; headcount: number } | null;
};

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);

/**
 * The owner home.
 *
 * Approvals first because they are the only thing here that is literally
 * blocking someone else's work; money last because it is the thing the owner
 * will look at whether or not it is at the top.
 */
export function OwnerHome({ header, approvals, alerts, yesterday, wages }: OwnerHomeProps) {
  const worst: AlertTone = alerts.some((a) => a.tone === 'stopped') ? 'stopped' : 'risk';
  const AttentionCard = alerts.length === 0 ? InfoCard : worst === 'stopped' ? FailCard : WarnCard;

  return (
    <HomeStack>
      <HeaderCard title={header.title} meta={header.meta} />

      {approvals.total > 0 ? (
        <ActionCard>
          {/* R1: a square count badge beside the title, not a big number underneath it —
              the badge and the two-line title read together as one fact. */}
          <div className="flex items-start gap-3">
            <CountBadge value={approvals.total} />
            <div className="min-w-0 pt-0.5">
              <p className="font-semibold text-indigo-950">Waiting on you</p>
              <p className="text-sm text-indigo-700">Nothing moves until you approve</p>
            </div>
          </div>
          <div className="mt-3 border-t border-indigo-200/70">
            {approvals.rows.map((row) => (
              <ApprovalRow key={row.id} title={row.title} age={row.age} />
            ))}
          </div>
          <div className="mt-3">
            <PrimaryButton href="/mis/approvals" icon={<CheckIcon />}>
              Review approvals
            </PrimaryButton>
          </div>
        </ActionCard>
      ) : (
        <OkCard>
          <SectionLabel>Waiting on you</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">Nothing is waiting on your approval.</p>
        </OkCard>
      )}

      <AttentionCard>
        <SectionLabel>Needs attention</SectionLabel>
        <div className="mt-1">
          {alerts.length === 0 ? (
            <EmptyNote>Nothing is stopped and no order is at risk right now.</EmptyNote>
          ) : (
            alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                tone={alert.tone}
                title={alert.title}
                detail={alert.detail}
                href={alert.href}
              />
            ))
          )}
        </div>
      </AttentionCard>

      <InfoCard>
        <SectionLabel>{yesterday.label}</SectionLabel>
        <div className="mt-2">
          {yesterday.recorded ? (
            <StatTrio
              items={[
                { value: yesterday.produced.toLocaleString('en-IN'), label: 'Output Nos' },
                {
                  value: yesterday.waste.toLocaleString('en-IN'),
                  label: 'Wastage Kg',
                  tone: yesterday.waste > 0 ? 'risk' : 'neutral',
                },
                { value: yesterday.machinesRun, label: 'Machines run' },
              ]}
            />
          ) : (
            <EmptyNote>No production was logged on that day.</EmptyNote>
          )}
        </div>
      </InfoCard>

      {wages && (
        <MoneyCard title={`Wage bill · ${wages.monthLabel}`}>
          <BigStat value={inr(wages.gross)} label={`${wages.headcount} people on the register`} />
          <Divider />
          <p className="text-sm text-slate-600">
            Overtime {inr(wages.ot)} <Mono>of the total</Mono>
          </p>
        </MoneyCard>
      )}
    </HomeStack>
  );
}
