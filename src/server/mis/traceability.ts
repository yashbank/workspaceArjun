import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { withCheckerNames } from '@/server/mis/qc';
import { withUploaderNames } from '@/server/mis/documents';

/** Full traceability for one order: BOM → production → QC → documents */
export async function getOrderTrace(orderId: string) {
  await requirePermission('orders.read');

  const [order, bom, productionLogs, qcChecks, documents] = await Promise.all([
    db.misOrder.findUnique({
      where: { id: orderId },
      include: { customer: { select: { name: true } } },
    }),
    db.misBom.findUnique({
      where: { orderId },
      include: {
        stages: {
          include: {
            process: { select: { name: true } },
            materials: { include: { item: { select: { name: true, unit: true } } }, orderBy: { seq: 'asc' } },
          },
          orderBy: { seq: 'asc' },
        },
      },
    }),
    db.misProductionLog.findMany({
      where: { orderId },
      include: {
        machine: { select: { name: true } },
        employee: { select: { name: true } },
        shift: { select: { name: true } },
      },
      orderBy: { loggedAt: 'asc' },
    }),
    db.misQcCheck.findMany({
      where: { orderId },
      orderBy: { checkTime: 'asc' },
    }).then(withCheckerNames),
    db.misDocument.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    }).then(withUploaderNames).catch(() => []),
  ]);

  const totalProduced = productionLogs.reduce((s, l) => s + Number(l.qtyProduced), 0);
  const totalWaste = productionLogs.reduce((s, l) => s + Number(l.qtyWaste ?? 0), 0);
  const passChecks = qcChecks.filter((q) => q.result === 'PASS').length;
  const failChecks = qcChecks.filter((q) => q.result === 'FAIL').length;

  return { order, bom, productionLogs, qcChecks, documents, totalProduced, totalWaste, passChecks, failChecks };
}
