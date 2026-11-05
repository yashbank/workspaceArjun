'use client';

import { FREQS, type Freq, type KeyRange } from '@/lib/mis/report-range';

import { useListNav } from './list-toolbar';
import { Tabs } from './tabs';

const LABEL: Record<Freq, string> = { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' };
const ARROW = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-100';

/**
 * R8 T4: the one frequency picker (day / week / month / quarter / year) with earlier / later
 * arrows. It keeps the range in the URL (`?freq=&at=`) through `useListNav`, so the server
 * re-queries and a refresh or shared link lands on the same range. `params` are the other
 * URL params to keep (e.g. `view`).
 */
export function RangeTabs({ basePath, range, params = {} }: { basePath: string; range: KeyRange; params?: Record<string, string | undefined> }) {
  const go = useListNav(basePath, { ...params, freq: range.freq, at: range.at });
  return (
    <div className="flex flex-col gap-2">
      <Tabs
        label="Range"
        tabs={FREQS.map((f) => ({ id: f, label: LABEL[f] }))}
        active={range.freq}
        onChange={(f) => go({ freq: f })}
      />
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Previous ${range.freq}`} className={ARROW} onClick={() => go({ at: range.prevAt })}>←</button>
        <span className="min-w-[120px] text-center font-medium text-slate-700">{range.label}</span>
        <button type="button" aria-label={`Next ${range.freq}`} className={ARROW} onClick={() => go({ at: range.nextAt })}>→</button>
      </div>
    </div>
  );
}
