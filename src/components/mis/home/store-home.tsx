'use client';

import {
  BigStat,
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
  StatTrio,
  WarnCard,
} from './cards';

export type StoreHomeProps = {
  header: { title: string; meta: string };
  stock: { lowStockCount: number; outOfStockCount: number; totalItems: number };
  movement: { todayIn: number; todayOut: number };
  openGrns: {
    total: number;
    rows: { id: string; grnNumber: string; poNumber: string; supplierName: string | null; age: string }[];
  };
};

export function StoreHome({ header, stock, movement, openGrns }: StoreHomeProps) {
  return (
    <HomeStack>
      <HeaderCard title={header.title} meta={header.meta} />

      {stock.lowStockCount > 0 || stock.outOfStockCount > 0 ? (
        <WarnCard>
          <SectionLabel>Stock health</SectionLabel>
          <div className="mt-2">
            <BigStat
              value={stock.lowStockCount}
              label={`${stock.lowStockCount === 1 ? 'item is' : 'items are'} below their reorder level · ${stock.outOfStockCount} at zero`}
            />
          </div>
          <div className="mt-3">
            <SecondaryButton href="/mis/store/stock">Open the stock list</SecondaryButton>
          </div>
        </WarnCard>
      ) : (
        <OkCard>
          <SectionLabel>Stock health</SectionLabel>
          <p className="mt-1 font-semibold text-slate-900">
            {stock.totalItems === 0
              ? 'No items are tracked yet.'
              : 'Every tracked item is above its reorder level.'}
          </p>
        </OkCard>
      )}

      <InfoCard>
        <SectionLabel>Moved today</SectionLabel>
        <div className="mt-2">
          <StatTrio
            items={[
              { value: movement.todayIn.toLocaleString('en-IN'), label: 'In', tone: 'ok' },
              { value: movement.todayOut.toLocaleString('en-IN'), label: 'Out', tone: 'neutral' },
              { value: stock.totalItems, label: 'Items tracked', tone: 'neutral' },
            ]}
          />
        </div>
      </InfoCard>

      <InfoCard>
        <SectionLabel>GRNs awaiting entry</SectionLabel>
        <div className="mt-1">
          {openGrns.rows.length === 0 ? (
            <EmptyNote>No goods receipt is waiting to be entered.</EmptyNote>
          ) : (
            openGrns.rows.map((grn) => (
              <RowLink
                key={grn.id}
                href={`/mis/grn/${grn.id}`}
                title={
                  <>
                    {grn.supplierName ?? 'No supplier'} <Mono>{grn.grnNumber}</Mono>
                  </>
                }
                detail={`Against ${grn.poNumber} · raised ${grn.age}`}
              />
            ))
          )}
        </div>
      </InfoCard>

      <div className="grid grid-cols-3 gap-2">
        <ShortcutTile href="/mis/store/receive" label="Receive (GRN)" icon={<DownIcon />} />
        <ShortcutTile href="/mis/store/issue" label="Issue" icon={<UpIcon />} />
        <ShortcutTile href="/mis/store/count" label="Count" icon={<CountIcon />} />
      </div>
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

function DownIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 3v11" />
      <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
      <path d="M4 17.5V20h16v-2.5" />
    </svg>
  );
}

function UpIcon() {
  return (
    <svg {...ICON}>
      <path d="M12 14V3" />
      <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
      <path d="M4 17.5V20h16v-2.5" />
    </svg>
  );
}

function CountIcon() {
  return (
    <svg {...ICON}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h4" />
    </svg>
  );
}
