'use client';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';
import { StatusBadge, type BadgeTone } from '@/components/mis/kit/status-badge';

type Order = { id: string; orderNumber: string; status: string; createdAt: Date | string; deliveryDate: Date | string | null; totalFormatted: string };
type Customer = {
  id: string; code: string; name: string; phone: string | null;
  city: string | null; gstNo: string | null; isActive: boolean;
};

interface Props { customer: Customer; orders: Order[]; canWrite: boolean }

/** Same five statuses as the Orders screen (DRAFT/CONFIRMED/IN_PRODUCTION/COMPLETE/CANCELLED) — this card must not invent its own. */
function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'DRAFT': return 'neutral';
    case 'CONFIRMED': return 'info';
    case 'IN_PRODUCTION': return 'warning';
    case 'COMPLETE': return 'good';
    case 'CANCELLED': return 'critical';
    default: return 'neutral';
  }
}

export function CustomerDetailScreen({ customer, orders, canWrite }: Props) {
  const totalOrders = orders.length;
  const deliveredOrders = orders.filter(o => o.status === 'COMPLETE').length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/mis/customers" className="inline-flex min-h-11 items-center hover:text-gray-700">Customers</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{customer.name}</span>
      </nav>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
            <p className="text-sm text-gray-500 mt-1 font-mono">{customer.code}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${customer.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            {customer.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-4 text-sm">
          {[
            { label: 'Phone', value: customer.phone ?? '—' },
            { label: 'City', value: customer.city ?? '—' },
            { label: 'GST No', value: customer.gstNo ?? '—' },
          ].map(item => (
            <div key={item.label}>
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className="font-medium text-gray-900 mt-0.5">{item.value}</div>
            </div>
          ))}
        </div>

        {canWrite && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <Link href={`/mis/orders?customerId=${customer.id}`}>
              <Button>+ Create Order</Button>
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{totalOrders}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Orders</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{deliveredOrders}</div>
          <div className="text-xs text-gray-500 mt-0.5">Completed</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 font-medium text-gray-700">Orders</div>
        {orders.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No orders yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm text-gray-900">{order.orderNumber}</span>
                  <StatusBadge tone={statusTone(order.status)}>{order.status.replace(/_/g, ' ')}</StatusBadge>
                </div>
                <div className="flex items-center gap-4">
                  {order.deliveryDate && (
                    <span className="text-xs text-gray-400">
                      Due: {new Date(order.deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <Link href={`/mis/orders/${order.id}`}>
                    <Button variant="ghost">View</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
