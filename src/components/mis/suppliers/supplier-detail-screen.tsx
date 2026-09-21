'use client';
import Link from 'next/link';
import { Button } from '@/components/mis/kit/button';

type PO = { id: string; poNumber: string; status: string; createdAt: Date | string; totalFormatted?: string };
type Supplier = {
  id: string; code: string; name: string; phone: string | null; city: string | null;
  gstNo: string | null; paymentTermsDays: number | null; isActive: boolean; createdAt: Date | string;
};

interface Props { supplier: Supplier; pos: PO[]; canWrite: boolean }

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  COMPLETE: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function SupplierDetailScreen({ supplier, pos, canWrite }: Props) {
  const totalPOs = pos.length;
  const completedPOs = pos.filter(p => p.status === 'COMPLETE').length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/mis/suppliers" className="hover:text-gray-700">Suppliers</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{supplier.name}</span>
      </nav>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
            <p className="text-sm text-gray-500 mt-1 font-mono">{supplier.code}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${supplier.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            {supplier.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          {[
            { label: 'Phone', value: supplier.phone ?? '—' },
            { label: 'City', value: supplier.city ?? '—' },
            { label: 'GST No', value: supplier.gstNo ?? '—' },
            { label: 'Payment Terms', value: supplier.paymentTermsDays ? `${supplier.paymentTermsDays} days` : '—' },
          ].map(item => (
            <div key={item.label}>
              <div className="text-xs text-gray-500">{item.label}</div>
              <div className="font-medium text-gray-900 mt-0.5">{item.value}</div>
            </div>
          ))}
        </div>

        {canWrite && (
          <div className="mt-5 pt-5 border-t border-gray-100">
            <Link href="/mis/po">
              <Button>+ Create PO</Button>
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{totalPOs}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total POs</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{completedPOs}</div>
          <div className="text-xs text-gray-500 mt-0.5">Completed</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 font-medium text-gray-700">Purchase Orders</div>
        {pos.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No purchase orders yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {pos.map((po) => (
              <div key={po.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm text-gray-900">{po.poNumber}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[po.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {po.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {po.totalFormatted !== undefined && <span className="text-sm text-gray-500">{po.totalFormatted}</span>}
                  <span className="text-xs text-gray-400">
                    {new Date(po.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                  <Link href={`/mis/po/${po.id}`}>
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
