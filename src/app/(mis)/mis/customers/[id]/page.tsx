import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { notFound } from 'next/navigation';
import { CustomerDetailScreen } from '@/components/mis/customers/customer-detail-screen';
import { requirePermission } from '@/server/mis/auth';

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'masters.write');

  await requirePermission('masters.read');
  const customer = await db.misCustomer.findUnique({
    where: { id },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, orderNumber: true, status: true, createdAt: true, deliveryDate: true },
      },
    },
  });
  if (!customer) notFound();

  const orders = (customer.orders ?? []).map((o: any) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt,
    deliveryDate: o.deliveryDate,
    totalFormatted: '—',
  }));

  return (
    <CustomerDetailScreen
      customer={{
        id: customer.id,
        code: customer.code,
        name: customer.name,
        phone: customer.phone,
        city: customer.city,
        gstNo: customer.gstNo,
        isActive: customer.isActive,
      }}
      orders={orders}
      canWrite={canWrite}
    />
  );
}
