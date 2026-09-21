import { isUuid } from '@/lib/mis/ids';
import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { notFound } from 'next/navigation';
import { SupplierDetailScreen } from '@/components/mis/suppliers/supplier-detail-screen';
import { requirePermission } from '@/server/mis/auth';
import { computePoTotal } from '@/server/mis/po';

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'masters.write');

  await requirePermission('masters.read');
  const supplier = await db.misSupplier.findUnique({
    where: { id },
    include: {
      purchaseOrders: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, poNumber: true, status: true, createdAt: true },
      },
    },
  });
  if (!supplier) notFound();

  const canSeeMoney = can(role, 'wages.read');
  const pos = await Promise.all(
    supplier.purchaseOrders.map(async (p) => ({
      id: p.id,
      poNumber: p.poNumber,
      status: p.status,
      createdAt: p.createdAt,
      // A PO total is money (D24, F-06): computed only for the Owner, absent for everyone else.
      ...(canSeeMoney ? { totalFormatted: await computePoTotal(p.id) } : {}),
    })),
  );

  return (
    <SupplierDetailScreen
      supplier={{
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        phone: supplier.phone,
        city: supplier.city,
        gstNo: supplier.gstNo,
        paymentTermsDays: supplier.paymentTermsDays,
        isActive: supplier.isActive,
        createdAt: supplier.createdAt,
      }}
      pos={pos}
      canWrite={canWrite}
    />
  );
}
