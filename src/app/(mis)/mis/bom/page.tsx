import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import Link from 'next/link';

export default async function BomListPage() {
  await requireMisAccess();
  const orders = (await listOrders()).filter((o) => !['CANCELLED', 'DELIVERED'].includes(o.status));

  return (
    <div className="p-6 max-w-4xl mx-auto text-slate-900">
      <h1 className="text-2xl font-semibold mb-6 text-slate-900">Bill of Materials</h1>
      {orders.length === 0 && (
        <p className="text-slate-500">No active orders found.</p>
      )}
      <div className="space-y-3">
        {orders.map((order) => (
          <Link
            key={order.id}
            href={`/mis/bom/${order.id}`}
            className="flex items-center justify-between p-4 bg-white text-slate-900 rounded-lg border border-slate-200 hover:border-slate-400 transition-colors"
          >
            <div>
              <span className="font-medium text-slate-900">{order.orderNumber}</span>
              <span className="ml-3 text-slate-700">{order.description || 'No description'}</span>
            </div>
            <span className="text-sm text-slate-600">View BOM →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
