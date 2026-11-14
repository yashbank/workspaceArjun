import { cn } from '@/lib/utils';

export type ListKpi = { label: string; value: number; /** Small caption under the number, e.g. "on this page". */ hint?: string; tone?: 'default' | 'good' | 'warn' | 'bad' };

const TONE: Record<NonNullable<ListKpi['tone']>, string> = { default: 'text-slate-900', good: 'text-emerald-800', warn: 'text-amber-700', bad: 'text-red-700' };

/** Counts-only KPI strip for a list screen. Never carries money (employee/inventory screens render it for every role). */
export function ListKpiStrip({ kpis, label }: { kpis: ListKpi[]; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={label}>
      {kpis.map((k) => (
        <div key={k.label} data-testid="list-kpi-card" className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-sm text-slate-600">{k.label}</div>
          <div className={cn('text-2xl font-semibold', TONE[k.tone ?? 'default'])}>{k.value}</div>
          {k.hint && <div className="text-xs text-slate-500">{k.hint}</div>}
        </div>
      ))}
    </div>
  );
}
