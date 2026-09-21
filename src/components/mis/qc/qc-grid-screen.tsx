'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/mis/kit/button';
import { Select, type SelectOption } from '@/components/mis/kit/select';
import { StatusBadge } from '@/components/mis/kit/status-badge';
import { addQcCheckAction } from '@/app/(mis)/mis/qc/actions';

type Check = { id: string; checkTime: Date; result: string; parameterName: string | null; orderId: string; order: { orderNumber: string } | null };
type Order = { id: string; orderNumber: string };

// Standard factory shift hours (6am–6pm in 1-hour slots)
const HOURS = Array.from({ length: 12 }, (_, i) => i + 6); // 6 through 17

const PARAMETERS = ['GSM', 'Caliper', 'Burst Factor', 'Moisture', 'Tension', 'Visual Check'];

export function QcGridScreen({ orders, todayChecks, canWrite }: { orders: Order[]; todayChecks: Check[]; canWrite: boolean }) {
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id ?? '');
  const [addingHour, setAddingHour] = useState<number | null>(null);
  const [param, setParam] = useState(PARAMETERS[0]);
  const [result, setResult] = useState<'PASS' | 'FAIL' | 'NA'>('PASS');
  const [isPending, startTransition] = useTransition();

  const orderOptions: SelectOption[] = orders.map(o => ({ value: o.id, label: o.orderNumber }));

  // Group today's checks by order × hour
  const checksByHour: Record<string, Record<number, Check[]>> = {};
  for (const check of todayChecks) {
    const h = new Date(check.checkTime).getHours();
    const key = check.orderId;
    if (!checksByHour[key]) checksByHour[key] = {};
    if (!checksByHour[key][h]) checksByHour[key][h] = [];
    checksByHour[key][h].push(check);
  }

  const currentHour = new Date().getHours();
  const orderChecks = selectedOrderId ? (checksByHour[selectedOrderId] ?? {}) : {};

  const handleAdd = () => {
    if (!selectedOrderId || addingHour === null) return;
    startTransition(async () => {
      await addQcCheckAction({ orderId: selectedOrderId, result, parameterName: param });
      setAddingHour(null);
    });
  };

  const resultOptions: SelectOption[] = [
    { value: 'PASS', label: 'Pass' },
    { value: 'FAIL', label: 'Fail' },
    { value: 'NA', label: 'N/A' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-baseline gap-3 mb-6 flex-wrap">
        <h1 className="text-2xl font-semibold">QC Hourly Grid</h1>
        {/* From 1024px up the whole-floor grid (D9) is the reading view of the shift; this screen is where a check is recorded. */}
        <Link href="/mis/qc/grid" className="hidden lg:inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 hover:underline">Whole-floor grid</Link>
        <span className="text-slate-500 text-sm">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p className="text-lg font-medium mb-1">No active production orders</p>
          <p className="text-sm">Orders in IN_PRODUCTION status appear here.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 max-w-xs">
            <Select label="Order" value={selectedOrderId} onChange={setSelectedOrderId} options={orderOptions} />
          </div>

          {/* Grid */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[640px]">
              <thead>
                <tr>
                  <th className="text-left text-xs text-slate-500 font-medium py-2 pr-4 w-20">Hour</th>
                  <th className="text-left text-xs text-slate-500 font-medium py-2">Checks</th>
                  <th className="text-left text-xs text-slate-500 font-medium py-2 w-24">Status</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {HOURS.map(h => {
                  const checks = orderChecks[h] ?? [];
                  const hasFail = checks.some(c => c.result === 'FAIL');
                  const hasPass = checks.some(c => c.result === 'PASS');
                  const isNow = h === currentHour;
                  const isPast = h < currentHour;

                  return (
                    <tr key={h} className={`border-b border-slate-100 ${isNow ? 'bg-blue-50' : ''}`}>
                      <td className="py-3 pr-4">
                        <span className={`font-mono text-sm font-medium ${isNow ? 'text-blue-700' : 'text-slate-600'}`}>
                          {h.toString().padStart(2, '0')}:00
                        </span>
                        {isNow && <span className="ml-1 text-xs text-blue-500">← now</span>}
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1 flex-wrap">
                          {checks.length === 0 ? (
                            <span className="text-slate-400 text-xs">{isPast ? 'No check recorded' : '—'}</span>
                          ) : (
                            checks.map(c => (
                              <StatusBadge key={c.id} tone={c.result === 'PASS' ? 'good' : c.result === 'FAIL' ? 'critical' : 'neutral'}>
                                {c.parameterName}: {c.result}
                              </StatusBadge>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        {checks.length > 0 && (
                          <StatusBadge tone={hasFail ? 'critical' : hasPass ? 'good' : 'neutral'}>
                            {hasFail ? 'FAIL' : hasPass ? 'PASS' : 'N/A'}
                          </StatusBadge>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {canWrite && (h === currentHour || (isPast && checks.length === 0)) && (
                          <Button variant="ghost" onClick={() => setAddingHour(h)}>
                            + Log
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add check modal */}
          {addingHour !== null && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <h2 className="font-semibold mb-4">Log QC Check — {addingHour.toString().padStart(2, '0')}:00</h2>
                <div className="space-y-4">
                  <Select label="Parameter" value={param} onChange={setParam} options={PARAMETERS.map(p => ({ value: p, label: p }))} />
                  <Select label="Result" value={result} onChange={(v) => setResult(v as 'PASS' | 'FAIL' | 'NA')} options={resultOptions} />
                </div>
                <div className="flex gap-2 mt-6">
                  <Button onClick={handleAdd} disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
                  <Button variant="ghost" onClick={() => setAddingHour(null)}>Cancel</Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
