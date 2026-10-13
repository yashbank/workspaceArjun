import { requireMisAccess } from '@/server/mis/guard';
import { getMisRole } from '@/server/mis/roles';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { MisForbiddenError, requirePermission } from '@/server/mis/auth';
import { auditChangesForRole } from '@/lib/mis/audit-redaction';
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
  // R3 B39: clamp the limit to 1..500 (NaN -> 100) and ignore anything that is not a YYYY-MM-DD date.
  const parsedLimit = Number.parseInt(sp.limit ?? '', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 100;
  const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
  const fromKey = sp.from && DATE_KEY.test(sp.from) && !Number.isNaN(new Date(sp.from).getTime()) ? sp.from : null;
  const toKey = sp.to && DATE_KEY.test(sp.to) && !Number.isNaN(new Date(sp.to).getTime()) ? sp.to : null;
  const from = fromKey ? new Date(fromKey) : null;
  const to = toKey ? new Date(`${toKey}T23:59:59.999`) : null;

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
        // before/after never leave the server raw: `auditChangesForRole` redacts money for every
        // role without wages.read (Admin can open this screen) and sends only the changed fields.
        ...auditChangesForRole(role, l.before, l.after),
        id: l.id,
        action: l.action,
        entity: l.entity,
        entityId: l.entityId,
        actorName: l.actor?.name ?? 'System',
        createdAt: l.createdAt,
      }))}
      initialFrom={fromKey ?? ''}
      initialTo={toKey ?? ''}
    />
  );
}
