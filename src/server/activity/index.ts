import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import type { UserProfile } from '@/generated/prisma/client';

const MAX_DAYS = 30;
const MAX_RESULTS = 200;

export type ActivityListItem = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
  actor: { id: string; email: string; name: string | null } | null;
  starred: boolean;
};

export type ActivityListQuery = {
  actorId?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  q?: string;
  starredOnly?: boolean;
};

function parseMeta(meta: unknown): Record<string, unknown> | null {
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return null;
}

function defaultFromDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - MAX_DAYS);
  d.setHours(0, 0, 0, 0);
  return d;
}

function matchesSearch(
  event: {
    action: string;
    meta: Record<string, unknown> | null;
    actor: { email: string; name: string | null } | null;
  },
  q: string,
): boolean {
  const lower = q.toLowerCase();
  const name =
    (typeof event.meta?.name === 'string' && event.meta.name) ||
    (typeof event.meta?.fileName === 'string' && event.meta.fileName) ||
    '';
  return (
    event.action.toLowerCase().includes(lower) ||
    name.toLowerCase().includes(lower) ||
    (event.actor?.email?.toLowerCase().includes(lower) ?? false) ||
    (event.actor?.name?.toLowerCase().includes(lower) ?? false)
  );
}

export async function listActivity(
  user: UserProfile,
  query: ActivityListQuery,
): Promise<{ events: ActivityListItem[]; actors: { id: string; email: string; name: string | null }[] }> {
  await requirePermission('audit:read');

  const from = query.from ? new Date(query.from) : defaultFromDate();
  const to = query.to ? new Date(query.to) : new Date();
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('Invalid date range');
  }

  const starredIds = query.starredOnly
    ? (
        await db.auditStar.findMany({
          where: { userId: user.id },
          select: { auditEventId: true },
        })
      ).map((s) => s.auditEventId)
    : null;

  if (query.starredOnly && starredIds?.length === 0) {
    return { events: [], actors: await listActivityActors() };
  }

  const rows = await db.auditEvent.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(starredIds ? { id: { in: starredIds } } : {}),
      ...(query.q
        ? {
            OR: [
              { action: { contains: query.q, mode: 'insensitive' } },
              { actor: { email: { contains: query.q, mode: 'insensitive' } } },
              { actor: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_RESULTS,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      meta: true,
      createdAt: true,
      actor: { select: { id: true, email: true, name: true } },
    },
  });

  const userStars = await db.auditStar.findMany({
    where: { userId: user.id, auditEventId: { in: rows.map((r) => r.id) } },
    select: { auditEventId: true },
  });
  const starSet = new Set(userStars.map((s) => s.auditEventId));

  let events: ActivityListItem[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    meta: parseMeta(r.meta),
    createdAt: r.createdAt,
    actor: r.actor,
    starred: starSet.has(r.id),
  }));

  if (query.q) {
    events = events.filter((e) => matchesSearch(e, query.q!));
  }

  return { events, actors: await listActivityActors() };
}

export async function listActivityActors(): Promise<
  { id: string; email: string; name: string | null }[]
> {
  await requirePermission('audit:read');
  const since = defaultFromDate();
  return db.userProfile.findMany({
    where: { auditEvents: { some: { createdAt: { gte: since } } } },
    select: { id: true, email: true, name: true },
    orderBy: { email: 'asc' },
  });
}

export async function starActivityEvent(user: UserProfile, auditEventId: string): Promise<void> {
  await requirePermission('audit:read');
  const event = await db.auditEvent.findUnique({ where: { id: auditEventId } });
  if (!event) throw new Error('Activity event not found');

  await db.auditStar.upsert({
    where: { userId_auditEventId: { userId: user.id, auditEventId } },
    create: { userId: user.id, auditEventId },
    update: {},
  });
}

export async function unstarActivityEvent(user: UserProfile, auditEventId: string): Promise<void> {
  await requirePermission('audit:read');
  await db.auditStar.deleteMany({
    where: { userId: user.id, auditEventId },
  });
}
