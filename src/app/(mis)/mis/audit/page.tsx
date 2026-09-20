import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { MisForbiddenError, requirePermission } from '@/server/mis/auth';
import { AuditScreen } from '@/components/mis/audit/audit-screen';

type Props = {
  searchParams: Promise<{ entity?: string; limit?: string; from?: string; to?: string }>;
};

export default async function AuditPage({ searchParams }: Props) {
  const user = await requireMisAccess();
  const role = await getMisRole(user.id);
  if (!can(role, 'settings.read')) throw new MisForbiddenError('settings.read');

  const sp = await searchParams;
  const entity = sp.entity;
  const limit = Math.min(parseInt(sp.limit ?? '100', 10), 500);
  const from = sp.from ? new Date(sp.from) : null;
  const to = sp.to ? new Date(`${sp.to}T23:59:59.999`) : null;

  await requirePermission('settings.read');
  const logs = await db.misAuditLog.findMany({
    where: {
      ...(entity ? { entity } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return (
    <AuditScreen
      logs={logs.map((l) => ({
        id: l.id,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        actorName: l.actor?.name ?? 'System',
        createdAt: l.createdAt,
      }))}
      initialFrom={sp.from ?? ''}
      initialTo={sp.to ?? ''}
    />
  );
}
