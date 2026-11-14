import { Card } from '@/components/mis/kit/card';

export type ListKpi = { label: string; value: number | string };

/** R2-394: four summary cards above a list, computed by the caller from rows already loaded (no extra query). */
export function ListKpiCards({ items, ariaLabel }: { items: ListKpi[]; ariaLabel: string }) {
  return (
    <div role="group" aria-label={ariaLabel} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((k) => (
        <Card key={k.label} className="p-3">
          <div className="text-sm text-slate-600">{k.label}</div>
          <div className="text-2xl font-semibold text-slate-900">{k.value}</div>
        </Card>
      ))}
    </div>
  );
}
