import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { CLOSED_ORDER_STATUSES } from '@/lib/mis/order-status';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';
import { ProductionScreen } from '@/components/mis/production/production-screen';
import { requirePermission } from '@/server/mis/auth';
import { listOptions } from '@/server/mis/master-option';
import { unitOptions } from '@/lib/mis/production-form';
import { clampPage, pageQuery, parsePage, parseSearch } from '@/lib/mis/pagination';

export default async function ProductionPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  const canWrite = can(role, 'production.write');

  await requirePermission('production.read');
  const sp = await searchParams;
  const q = parseSearch(sp.q);
  // The same closed-status list the server refuses on (D14). This used to omit
  // COMPLETED, so the screen offered an order the write would then reject.
  const where: Prisma.MisOrderWhereInput = {
    status: { notIn: [...CLOSED_ORDER_STATUSES, 'DRAFT'] },
    ...(q
      ? { OR: [{ orderNumber: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }] }
      : {}),
  };
  const { skip, take } = pageQuery(sp.page);
  // R2-129: the visible table pages 10 at a time; the production-entry picker still offers every open order, not just the page shown.
  const [orders, total, pickerOrders, machines, unitMaster] = await Promise.all([
    db.misOrder.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { productionLogs: { where: { voidedAt: null } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    db.misOrder.count({ where }),
    db.misOrder.findMany({
      where: { status: { notIn: [...CLOSED_ORDER_STATUSES, 'DRAFT'] } },
      include: {
        customer: { select: { id: true, name: true } },
        _count: { select: { productionLogs: { where: { voidedAt: null } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.misMachine.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    canWrite ? listOptions('UNIT') : Promise.resolve([]),
  ]);

  return (
    <ProductionScreen
      orders={orders}
      pickerOrders={pickerOrders}
      machines={machines}
      units={unitOptions(unitMaster)}
      canWrite={canWrite}
      userId={user.id}
      // Rendered now. Offline, the screen shows this back as "lists as of HH:MM"
      // (D16) — the cached copy of this page is the only source it has.
      loadedAt={new Date().toISOString()}
      paging={{ total, page: clampPage(parsePage(sp.page), total), params: { q } }}
    />
  );
}
