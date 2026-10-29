import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { logAuditEvent } from '@/server/mis/audit';
import { dateKeyToDbDate } from '@/lib/mis/factory-time';
import { resolveShiftForDate, rosterRangesOverlap } from '@/lib/mis/shift-roster';

/** R2-214: dated shift roster. Read = attendance.read, write = attendance.write (same gate as shift management). */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 366;
const keyOf = (d: Date) => d.toISOString().slice(0, 10);

export async function listRoster(range: { from: string; to: string }) {
  await requirePermission('attendance.read');
  if (!DATE_KEY.test(range.from) || !DATE_KEY.test(range.to) || range.from > range.to) throw new Error('Pick a valid date range');
  const rows = await db.misShiftRoster.findMany({
    where: { startDate: { lte: dateKeyToDbDate(range.to) }, endDate: { gte: dateKeyToDbDate(range.from) } },
    orderBy: [{ employeeId: 'asc' }, { startDate: 'asc' }],
  });
  return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, shiftId: r.shiftId, startDate: keyOf(r.startDate), endDate: keyOf(r.endDate) }));
}

/** People the roster can be assigned to: active, not deleted. */
export async function listRosterEmployees() {
  await requirePermission('attendance.read');
  return db.misEmployee.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, employeeCode: true, defaultShiftId: true },
    orderBy: { name: 'asc' },
  });
}

export async function assignRoster(input: { employeeIds: string[]; shiftId: string; startDate: string; endDate: string }) {
  const actor = await requirePermission('attendance.write');
  const employeeIds = [...new Set(input.employeeIds ?? [])];
  if (employeeIds.length === 0) throw new Error('Pick at least one employee');
  if (!DATE_KEY.test(input.startDate ?? '') || !DATE_KEY.test(input.endDate ?? '')) throw new Error('Pick a from and to date');
  if (input.endDate < input.startDate) throw new Error('The end date cannot be before the start date');
  const span = (dateKeyToDbDate(input.endDate).getTime() - dateKeyToDbDate(input.startDate).getTime()) / 86_400_000 + 1;
  if (span > MAX_SPAN_DAYS) throw new Error('A roster entry can cover at most one year');
  const shift = await db.misShift.findUnique({ where: { id: input.shiftId }, select: { id: true, isActive: true } });
  if (!shift || !shift.isActive) throw new Error('Pick an active shift');
  const people = await db.misEmployee.findMany({ where: { id: { in: employeeIds }, deletedAt: null, isActive: true }, select: { id: true, name: true } });
  if (people.length !== employeeIds.length) throw new Error('One of the selected employees is not active');

  const existing = await db.misShiftRoster.findMany({ where: { employeeId: { in: employeeIds } }, select: { employeeId: true, startDate: true, endDate: true } });
  const clashing = people.filter((p) => existing.some((r) => r.employeeId === p.id && rosterRangesOverlap(r, input)));
  if (clashing.length > 0) {
    throw new Error(`Already rostered in that range: ${clashing.map((p) => p.name).join(', ')}. Remove the old entry first.`);
  }

  const created = await db.$transaction(
    employeeIds.map((employeeId) =>
      db.misShiftRoster.create({
        data: { employeeId, shiftId: input.shiftId, startDate: dateKeyToDbDate(input.startDate), endDate: dateKeyToDbDate(input.endDate), createdBy: actor.userId },
      }),
    ),
  );
  for (const r of created) {
    await logAuditEvent({
      actorId: actor.userId,
      action: 'ASSIGN_SHIFT_ROSTER',
      entity: 'MisShiftRoster',
      entityId: r.id,
      after: { employeeId: r.employeeId, shiftId: r.shiftId, startDate: input.startDate, endDate: input.endDate },
    });
  }
  return { count: created.length };
}

export async function removeRoster(id: string) {
  const actor = await requirePermission('attendance.write');
  const row = await db.misShiftRoster.findUnique({ where: { id } });
  if (!row) throw new Error('Roster entry not found');
  await db.misShiftRoster.delete({ where: { id } });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'REMOVE_SHIFT_ROSTER',
    entity: 'MisShiftRoster',
    entityId: id,
    before: { employeeId: row.employeeId, shiftId: row.shiftId, startDate: keyOf(row.startDate), endDate: keyOf(row.endDate) },
  });
}

type Reader = Pick<typeof db, 'misShiftRoster' | 'misEmployee'>;

/**
 * The shift this employee is on for a factory date key: roster first, else their default shift. Null when neither.
 * Pass `defaultShiftId` when the caller already loaded the employee, to skip that read.
 */
// Not `async`: an internal helper called from already-gated paths (clock-in, the kiosk punch), not a gated entry point.
export function resolveEmployeeShiftId(employeeId: string, dateKey: string, client: Reader = db, defaultShiftId?: string | null): Promise<string | null> {
  return resolveEmployeeShiftIdImpl(employeeId, dateKey, client, defaultShiftId);
}

async function resolveEmployeeShiftIdImpl(employeeId: string, dateKey: string, client: Reader, defaultShiftId?: string | null): Promise<string | null> {
  const day = dateKeyToDbDate(dateKey);
  const [emp, rows] = await Promise.all([
    defaultShiftId !== undefined ? { defaultShiftId } : client.misEmployee.findUnique({ where: { id: employeeId }, select: { defaultShiftId: true } }),
    // Optional call: narrow hand-built test doubles of the client carry no roster delegate; a real client always does.
    (client.misShiftRoster as Reader['misShiftRoster'] | undefined)?.findMany({ where: { employeeId, startDate: { lte: day }, endDate: { gte: day } }, select: { shiftId: true, startDate: true, endDate: true } }) ?? [],
  ]);
  return resolveShiftForDate(emp ?? {}, dateKey, rows);
}
