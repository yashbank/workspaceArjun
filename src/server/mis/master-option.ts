import { db } from '@/server/db';
import { toOptionValue } from '@/lib/mis/master-groups';

import { requirePermission } from './auth';
import { logAuditEvent } from './audit';

/**
 * One server module for every simple dropdown in the system.
 *
 * Seven option masters cost one build instead of seven, and an eighth group
 * costs a string rather than a deployment.
 *
 * Every function opens with requirePermission() and closes with
 * logAuditEvent() — the E1-05 pattern.
 */

export type MasterOptionInput = {
  group: string;
  label: string;
  labelHi?: string | null;
  value?: string;
};

/** Active options for a group, in display order. */
export async function listOptions(group: string, includeDeleted = false) {
  await requirePermission('masters.read', group);

  return db.misMasterOption.findMany({
    where: { group, ...(includeDeleted ? {} : { deletedAt: null }) },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
}

/** Search within a group, in the database — never by loading every row. */
export async function searchOptions(group: string, query: string, limit = 50) {
  await requirePermission('masters.read', group);

  const trimmed = query.trim();
  return db.misMasterOption.findMany({
    where: {
      group,
      deletedAt: null,
      ...(trimmed
        ? {
            OR: [
              { label: { contains: trimmed, mode: 'insensitive' as const } },
              { labelHi: { contains: trimmed, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    take: limit,
  });
}

export async function createOption(input: MasterOptionInput) {
  const actor = await requirePermission('masters.write', input.group);

  const last = await db.misMasterOption.findFirst({
    where: { group: input.group, deletedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const created = await db.misMasterOption.create({
    data: {
      group: input.group,
      value: input.value ?? toOptionValue(input.label),
      label: input.label.trim(),
      labelHi: input.labelHi?.trim() || null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
    },
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'master_option.create',
    entity: 'MisMasterOption',
    entityId: created.id,
    after: created,
  });

  return created;
}

export async function updateOption(
  id: string,
  patch: Partial<Pick<MasterOptionInput, 'label' | 'labelHi'>> & { isActive?: boolean },
) {
  const actor = await requirePermission('masters.write');

  const before = await db.misMasterOption.findUnique({ where: { id } });
  if (!before) throw new Error(`Master option ${id} not found`);

  const after = await db.misMasterOption.update({
    where: { id },
    data: {
      ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
      ...(patch.labelHi !== undefined ? { labelHi: patch.labelHi?.trim() || null } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
    },
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'master_option.update',
    entity: 'MisMasterOption',
    entityId: id,
    before,
    after,
  });

  return after;
}

/**
 * Soft delete only.
 *
 * An option already referenced by a job card can be deactivated but never
 * removed — a job card printed last year must still resolve its GSM value next
 * year. There is deliberately no hard-delete function in this module.
 */
export async function deleteOption(id: string) {
  const actor = await requirePermission('masters.write');

  const before = await db.misMasterOption.findUnique({ where: { id } });
  if (!before) throw new Error(`Master option ${id} not found`);

  const after = await db.misMasterOption.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'master_option.delete',
    entity: 'MisMasterOption',
    entityId: id,
    before,
    after,
  });

  return after;
}

export async function restoreOption(id: string) {
  const actor = await requirePermission('masters.write');

  const after = await db.misMasterOption.update({
    where: { id },
    data: { deletedAt: null, isActive: true },
  });

  await logAuditEvent({
    actorId: actor.userId,
    action: 'master_option.restore',
    entity: 'MisMasterOption',
    entityId: id,
    after,
  });

  return after;
}

/**
 * Rewrite the whole group's order in one transaction.
 *
 * Row-at-a-time reordering leaves the list visibly half-sorted if the third
 * write fails, which on a slow factory connection is a matter of when.
 */
export async function reorderOptions(group: string, orderedIds: string[]) {
  const actor = await requirePermission('masters.write', group);

  await db.$transaction(
    orderedIds.map((id, index) =>
      db.misMasterOption.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );

  await logAuditEvent({
    actorId: actor.userId,
    action: 'master_option.reorder',
    entity: 'MisMasterOption',
    entityId: group,
    after: { order: orderedIds },
  });
}

/**
 * The "+ Add option" affordance behind every dropdown (S3).
 *
 * Returns the new option's value so the form can select it immediately, which
 * is what lets a user add a missing GSM without abandoning a half-filled job
 * card. An existing (even deactivated) value is reused rather than duplicated.
 */
export async function addOptionInline(group: string, label: string): Promise<string> {
  await requirePermission('masters.write', group);

  const value = toOptionValue(label);
  const existing = await db.misMasterOption.findFirst({ where: { group, value } });
  if (existing) {
    if (existing.deletedAt) await restoreOption(existing.id);
    return existing.value;
  }

  const created = await createOption({ group, label });
  return created.value;
}

/** Live option count per group, for the masters index. One query, not seven. */
export async function countsByGroup(): Promise<Record<string, number>> {
  await requirePermission('masters.read');

  const rows = await db.misMasterOption.groupBy({
    by: ['group'],
    where: { deletedAt: null },
    _count: { _all: true },
  });

  return Object.fromEntries(rows.map((r) => [r.group, r._count._all]));
}
