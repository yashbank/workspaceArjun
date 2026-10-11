'use client';

import {
  BigStat,
  Chip,
  EmptyNote,
  HeaderCard,
  HomeStack,
  InfoCard,
  Mono,
  OkCard,
  RowLink,
  SecondaryButton,
  SectionLabel,
  ShortcutTile,
  WarnCard,
} from './cards';

export type AdminHomeProps = {
  header: { title: string; meta: string };
  orders: {
    id: string;
    orderNumber: string;
    customerName: string | null;
    nextAction: string;
    lateRisk: boolean;
  }[];
  attendance: { present: number; headcount: number; recorded: boolean };
  hindiGap: { total: number };
  /** Phase 23 — Appendix B §B.7's inbox: writes nobody has resolved yet. */
  queue: { total: number };
  /** V2 Epic 4 — deliveries confirmed since the office last looked. No money here, ever (D24). */
  grnAlerts?: { id: string; grnId: string; title: string; detail: string; attention: boolean }[];
};

/**
 * The admin home: a desk, not a dashboard.
 *
 * Three things you start over and over sit at the top as shortcuts; below them
 * the orders that are waiting on an office decision, each one already carrying
 * the next step in words.
 */
export function AdminHome({ header, orders, attendance, hindiGap, queue, grnAlerts = [] }: AdminHomeProps) {
  return (
    <HomeStack>
      <HeaderCard title={header.title} meta={header.meta} />

      <div className="grid grid-cols-3 gap-2">
        <ShortcutTile href="/mis/orders" label="New order" icon={<PlusIcon />} />
        <ShortcutTile href="/mis/production" label="Issue job card" icon={<CardIcon />} />
        <ShortcutTile href="/mis/masters" label="Masters" icon={<StackIcon />} />
      </div>

      <InfoCard>
        <SectionLabel>Orders needing you</SectionLabel>
        <div className="mt-1">
          {orders.length === 0 ? (
            <EmptyNote>No open order is waiting on the office.</EmptyNote>
          ) : (
            orders.map((order) => (
              <RowLink
                key={order.id}
                href={`/mis/orders/${order.id}`}
                title={
                  <>
                    {order.customerName ?? 'No customer'} <Mono>{order.orderNumber}</Mono>
                  </>
                }
                detail={order.nextAction}
                right={
                  order.lateRisk ? <Chip tone="risk">Late risk</Chip> : <Chip tone="action">Go</Chip>
                }
              />
            ))
          )}
        </div>
      </InfoCard>

      {grnAlerts.length > 0 && (
        <InfoCard>
          <SectionLabel>Deliveries received</SectionLabel>
          <div className="mt-1">
            {grnAlerts.map((g) => (
              <RowLink
                key={g.id}
                href={`/mis/grn/${g.grnId}`}
                title={<Mono>{g.title}</Mono>}
                detail={g.detail}
                right={g.attention ? <Chip tone="risk">Check</Chip> : <Chip tone="action">OK</Chip>}
              />
            ))}
          </div>
        </InfoCard>
      )}

      <InfoCard>
        <SectionLabel>Attendance today</SectionLabel>
        <div className="mt-2">
          {attendance.recorded ? (
            <BigStat
              value={attendance.present}
              total={attendance.headcount}
              label="clocked in on the register"
            />
          ) : (
            <EmptyNote>Nothing has been entered on today’s register yet.</EmptyNote>
          )}
        </div>
      </InfoCard>

      {hindiGap.total > 0 ? (
        <WarnCard>
          <SectionLabel>Data health</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">
            {hindiGap.total} {hindiGap.total === 1 ? 'master is' : 'masters are'} missing a Hindi
            name
          </p>
          <p className="mb-3 text-sm text-slate-600">
            Anyone on the Hindi side of the toggle sees the English label instead.
          </p>
          <SecondaryButton href="/mis/masters">Fix them</SecondaryButton>
        </WarnCard>
      ) : (
        <OkCard>
          <SectionLabel>Data health</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">Every master has a Hindi name.</p>
        </OkCard>
      )}

      {queue.total > 0 ? (
        <WarnCard>
          <SectionLabel>Parked writes</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">
            {queue.total} {queue.total === 1 ? 'entry is' : 'entries are'} stuck in the queue
          </p>
          <p className="mb-3 text-sm text-slate-600">
            A write from a tablet or the portal never landed — see why and resolve it.
          </p>
          <SecondaryButton href="/mis/queue">Open the inbox</SecondaryButton>
        </WarnCard>
      ) : (
        <OkCard>
          <SectionLabel>Parked writes</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">Nothing is stuck in the queue.</p>
        </OkCard>
      )}
    </HomeStack>
  );
}

const ICON = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  className: 'h-5 w-5',
  'aria-hidden': true,
} as const;

function PlusIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 14.5h5" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg {...ICON}>
      <path d="m12 3 9 4.5-9 4.5-9-4.5Z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </svg>
  );
}
