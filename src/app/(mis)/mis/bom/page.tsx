import { requireMisAccess } from '@/server/mis/guard';
import { listOrders } from '@/server/mis/orders';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import Link from 'next/link';

export default async function BomListPage() {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'orders.write');
  const orders = (await listOrders()).filter((o: any) => !['CANCELLED', 'DELIVERED'].includes(o.status));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Bill of Materials</h1>
      {orders.length === 0 && (
        <p className="text-slate-500">No active orders found.</p>
      )}
      <div className="space-y-3">
        {orders.map((order: any) => (
          <Link
            key={order.id}
            href={`/mis/bom/${order.id}`}
            className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 hover:border-slate-400 transition-colors"
          >
            <div>
              <span className="font-medium">{order.orderNumber}</span>
              <span className="ml-3 text-slate-600">{order.description || 'No description'}</span>
            </div>
            <span className="text-sm text-slate-400">View BOM →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
