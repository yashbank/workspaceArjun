/** R2-376: 4-card KPI strip above the filter chips (same pattern as the /mis/bom pipeline summary). */
export type InvoiceKpis = { total: number; matched: number; discrepancies: number; approved: number };

export function InvoiceKpiStrip({ kpis }: { kpis: InvoiceKpis }) {
  const cards: Array<[string, number, string]> = [
    ['Total Invoices', kpis.total, 'text-slate-900'],
    ['Matched', kpis.matched, 'text-emerald-800'],
    ['Discrepancies Requiring Action', kpis.discrepancies, kpis.discrepancies > 0 ? 'text-red-700' : 'text-slate-900'],
    ['Approved for Payment', kpis.approved, 'text-indigo-800'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Supplier invoice summary">
      {cards.map(([label, n, tone]) => (
        <div key={label} data-testid="invoice-kpi-card" className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-sm text-slate-600">{label}</div>
          <div className={`text-2xl font-semibold ${tone}`}>{n}</div>
        </div>
      ))}
    </div>
  );
}
