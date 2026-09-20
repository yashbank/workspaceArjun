import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { listInventoryLedger, getInventoryBalance } from '@/server/mis/inventory';
import { db } from '@/server/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AdjustDialog } from '@/components/mis/inventory/adjust-dialog';

export default async function InventoryItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'inventory.write');

  const item = await db.misItem.findUnique({ where: { id: itemId } });
  if (!item) notFound();

  const [ledger, balance] = await Promise.all([
    listInventoryLedger(itemId),
    getInventoryBalance(itemId),
  ]);

  const sourceLabel = (s: string) => {
    switch (s) {
      case 'GRN': return 'GRN Receipt';
      case 'PRODUCTION': return 'Production Use';
      case 'MANUAL_ADJUSTMENT': return 'Manual Adjustment';
      default: return s.replace(/_/g, ' ');
    }
  };

  const grnIds = [...new Set(ledger.filter((e) => e.source === 'GRN' && e.sourceId).map((e) => e.sourceId as string))];
  const grns = grnIds.length > 0
    ? await db.misGrn.findMany({ where: { id: { in: grnIds } }, select: { id: true, grnNumber: true } })
    : [];
  const grnNumberById = new Map(grns.map((g) => [g.id, g.grnNumber]));

  return (
    <div className="max-w-3xl mx-auto py-6 space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/mis/inventory" className="hover:underline">Inventory</Link>
        <span className="mx-2">&#x203A;</span>
        <span className="text-slate-800 font-medium">{item.name}</span>
      </nav>

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{item.name}</h1>
            <div className="text-sm text-slate-500 mt-1 font-mono">{item.code}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-slate-900">{balance.balance}</div>
            <div className="text-sm text-slate-500">{item.unit ?? 'units'}</div>
          </div>
        </div>
        {canWrite && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
            <AdjustDialog
              itemId={item.id}
              itemName={item.name}
              currentBalance={Number(balance.balance)}
              unit={item.unit ?? 'units'}
            />
          </div>
        )}
      </div>

      <div>
        <h2 className="font-semibold text-slate-700 mb-3">Transaction History</h2>
        {ledger.length === 0 ? (
          <div className="text-slate-400 text-sm text-center py-8">No transactions yet.</div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Source</th>
                  <th className="px-4 py-2 text-right">Change</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {ledger.map((entry: any) => {
                  const change = Number(entry.changeQty);
                  const bal = Number(entry.balanceQty);
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-2 text-slate-700">
                        {entry.source === 'GRN' && entry.sourceId && grnNumberById.has(entry.sourceId) ? (
                          <Link href={`/mis/grn/${entry.sourceId}`} className="text-blue-600 hover:underline">
                            {sourceLabel(entry.source)} · {grnNumberById.get(entry.sourceId)}
                          </Link>
                        ) : (
                          sourceLabel(entry.source)
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-mono font-medium ${change >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {change >= 0 ? '+' : ''}{change}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">{bal}</td>
                      <td className="px-4 py-2 text-slate-400 text-xs">{entry.notes ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
