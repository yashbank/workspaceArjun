import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import type { Prisma, UserProfile } from '@/generated/prisma/client';
import {
  defaultActivityFromDate,
  parseActivityDateRange,
} from '@/lib/activity-dates';

const PAGE_SIZE = 50;
const RECENT_DEFAULT = 8;

export type ActivityActor = {
  id: string;
  email: string;
  name: string | null;
};

export type ActivityListItem = {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
  actor: ActivityActor | null;
  starred: boolean;
};

export type ActivityListQuery = {
  actorId?: string;
  action?: string;
  targetType?: string;
  from?: string;
  to?: string;
  /** Client `Date.getTimezoneOffset()` minutes (local → UTC). */
  tzOffset?: number;
  q?: string;
  starredOnly?: boolean;
  /** 1-based page number (50 events per page). */
  page?: number;
};

export {
  parseActivityDateRange,
  defaultActivityFromDate as defaultFromDate,
} from '@/lib/activity-dates';

const activitySelect = {
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  meta: true,
  createdAt: true,
  actor: { select: { id: true, email: true, name: true } },
} as const;

export function parseMeta(meta: unknown): Record<string, unknown> | null {
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return null;
}

function mapRowsToEvents(
  rows: {
    id: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    meta: unknown;
    createdAt: Date;
    actor: ActivityActor | null;
  }[],
  starSet: Set<string>,
): ActivityListItem[] {
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    meta: parseMeta(r.meta),
    createdAt: r.createdAt,
    actor: r.actor,
    starred: starSet.has(r.id),
  }));
}

/** Dashboard recent activity — same shape as /activity, newest first, no date window. */
export async function fetchRecentActivity(limit = RECENT_DEFAULT): Promise<ActivityListItem[]> {
  const rows = await db.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: activitySelect,
  });
  return mapRowsToEvents(rows, new Set());
}

export type ActivityListResult = {
  events: ActivityListItem[];
  actors: ActivityActor[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listActivity(
  user: UserProfile,
  query: ActivityListQuery,
): Promise<ActivityListResult> {
  await requirePermission('audit:read');

  const { from, to } = parseActivityDateRange(query.from, query.to, query.tzOffset);
  const page = Math.max(1, Math.floor(query.page ?? 1));

  // The actor list (for the filter dropdown) is independent of the events query,
  // so fetch it in parallel with the events chain instead of after it.
  const actorsPromise = listActivityActors();

  const starredIds = query.starredOnly
    ? (
        await db.auditStar.findMany({
          where: { userId: user.id },
          select: { auditEventId: true },
        })
      ).map((s) => s.auditEventId)
    : null;

  if (query.starredOnly && starredIds?.length === 0) {
    return { events: [], actors: await actorsPromise, total: 0, page, pageSize: PAGE_SIZE };
  }

  // All filtering happens in SQL (incl. file/folder name search via the meta
  // JSON path) so that count + skip/take pagination stay consistent.
  const where: Prisma.AuditEventWhereInput = {
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
            { meta: { path: ['name'], string_contains: query.q } },
            { meta: { path: ['fileName'], string_contains: query.q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.auditEvent.count({ where }),
    db.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: activitySelect,
    }),
  ]);

  const userStars = await db.auditStar.findMany({
    where: { userId: user.id, auditEventId: { in: rows.map((r) => r.id) } },
    select: { auditEventId: true },
  });
  const starSet = new Set(userStars.map((s) => s.auditEventId));

  return {
    events: mapRowsToEvents(rows, starSet),
    actors: await actorsPromise,
    total,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function listActivityActors(): Promise<ActivityActor[]> {
  await requirePermission('audit:read');
  const since = defaultActivityFromDate();
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

/** Owner-only: delete a single audit event (and any stars on it). */
export async function deleteActivityEvent(actor: UserProfile, eventId: string): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Forbidden');
  }
  await db.auditStar.deleteMany({ where: { auditEventId: eventId } });
  // deleteMany (not delete) so a missing id is a no-op rather than a throw.
  await db.auditEvent.deleteMany({ where: { id: eventId } });
}

/** Owner-only: wipe all audit stars and events (demo reset). */
export async function clearAllActivityHistory(actor: UserProfile): Promise<{ deletedEvents: number }> {
  if (actor.role !== 'owner') {
    throw new Error('Forbidden');
  }
  await db.auditStar.deleteMany({});
  const result = await db.auditEvent.deleteMany({});
  return { deletedEvents: result.count };
}
