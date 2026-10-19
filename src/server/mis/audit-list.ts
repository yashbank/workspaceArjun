import type { Prisma } from '@/generated/prisma/client';
import { auditChangesForRole } from '@/lib/mis/audit-redaction';
import { pageQuery, parseSearch, type Paged } from '@/lib/mis/pagination';
import { db } from '@/server/db';
import { requirePermission } from './auth';

export type AuditListRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string;
  createdAt: Date;
  changes: { path: string; from: string; to: string }[];
  severity: string | null;
};

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const validKey = (v: string | undefined) => (v && DATE_KEY.test(v) && !Number.isNaN(new Date(v).getTime()) ? v : null);

/**
 * R2-83: one page (25) of the audit log (`settings.read`). `q` matches action, entity or actor; `entity`, `from`, `to`
 * narrow it. before/after never leave raw: `auditChangesForRole` redacts money for every role without `wages.read`.
 * `entities` is every entity name in the log so the filter offers more than the current page's.
 */
export async function listAuditPage(
  opts: { q?: string; entity?: string; from?: string; to?: string; page?: number | string } = {},
): Promise<Paged<AuditListRow> & { entities: string[] }> {
  const actor = await requirePermission('settings.read');
  const q = parseSearch(opts.q);
  const fromKey = validKey(opts.from);
  const toKey = validKey(opts.to);
  const where: Prisma.MisAuditLogWhereInput = {
    ...(opts.entity ? { entity: opts.entity } : {}),
    ...(fromKey || toKey
      ? { createdAt: { ...(fromKey ? { gte: new Date(fromKey) } : {}), ...(toKey ? { lte: new Date(`${toKey}T23:59:59.999`) } : {}) } }
      : {}),
    ...(q
      ? {
          OR: [
            { action: { contains: q, mode: 'insensitive' } },
            { entity: { contains: q, mode: 'insensitive' } },
            { actor: { name: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const { skip, take } = pageQuery(opts.page);
  const [logs, total, entityRows] = await Promise.all([
    db.misAuditLog.findMany({ where, include: { actor: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    db.misAuditLog.count({ where }),
    db.misAuditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
  ]);
  return {
    rows: logs.map((l) => ({
      ...auditChangesForRole(actor.role, l.before, l.after),
      id: l.id,
      action: l.action,
      entity: l.entity,
      entityId: l.entityId,
      actorName: l.actor?.name ?? 'System',
      createdAt: l.createdAt,
    })),
    total,
    entities: entityRows.map((e) => e.entity),
  };
}
