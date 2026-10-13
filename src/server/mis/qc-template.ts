import type { Prisma } from '@/generated/prisma/client';
import {
  CHECKLIST_STATUSES,
  DEFAULT_QC_TEMPLATES,
  LEGACY_QC_TEMPLATE_NAMES,
  checklistStatusToCheck,
  moveItem,
  parseParameters,
  slotTimes,
  type ChecklistStatus,
} from '@/lib/mis/qc-template';
import { db } from '@/server/db';

import { logAuditEvent } from './audit';
import { requirePermission } from './auth';
import { addQcCheck } from './qc';

/**
 * V2 Epic 5 — QC checklist templates. Owner/Admin maintain them (`settings.write`); QC reads
 * them and taps cells (`qc.write`), each tap landing as an ordinary `MisQcCheck`.
 */

export type QcTemplateInput = {
  name: string;
  processName?: string | null;
  slotStart?: string;
  slotEnd?: string;
  /** One parameter per entry; blank entries dropped. */
  parameters: string[];
};

export type QcTemplateRow = {
  id: string;
  name: string;
  processName: string | null;
  slotStart: string;
  slotEnd: string;
  parameters: string[];
  slots: string[];
  isActive: boolean;
  sortOrder: number;
};

function toRow(t: { id: string; name: string; processName: string | null; slotStart: string; slotEnd: string; parameters: unknown; isActive: boolean; sortOrder: number }): QcTemplateRow {
  return { id: t.id, name: t.name, processName: t.processName, slotStart: t.slotStart, slotEnd: t.slotEnd, parameters: parseParameters(t.parameters), slots: slotTimes(t.slotStart, t.slotEnd), isActive: t.isActive, sortOrder: t.sortOrder };
}

function validated(input: QcTemplateInput) {
  const name = input.name.trim();
  if (!name) throw new Error('A template needs a name.');
  const parameters = parseParameters(input.parameters);
  if (parameters.length === 0) throw new Error('A template needs at least one parameter.');
  const slotStart = input.slotStart ?? '09:15', slotEnd = input.slotEnd ?? '18:00';
  slotTimes(slotStart, slotEnd); // throws on a bad range
  return { name, processName: input.processName?.trim() || null, slotStart, slotEnd, parameters: parameters as unknown as Prisma.InputJsonValue };
}

export async function listQcTemplates(includeInactive = false): Promise<QcTemplateRow[]> {
  await requirePermission('qc.read');
  const rows = await db.misQcTemplate.findMany({
    where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toRow);
}

export async function createQcTemplate(input: QcTemplateInput): Promise<QcTemplateRow> {
  const actor = await requirePermission('settings.write');
  const created = await db.misQcTemplate.create({ data: validated(input) });
  await logAuditEvent({ actorId: actor.userId, action: 'qc_template.create', entity: 'MisQcTemplate', entityId: created.id, after: created });
  return toRow(created);
}

export async function updateQcTemplate(id: string, input: QcTemplateInput): Promise<QcTemplateRow> {
  const actor = await requirePermission('settings.write');
  const before = await db.misQcTemplate.findUnique({ where: { id } });
  if (!before) throw new Error('Template not found');
  const data = validated(input);
  // Past checks are matched to the grid and the print by `parameterName`, so a parameter that
  // has recorded checks can be neither renamed nor removed: its history would vanish.
  const kept = new Set(parseParameters(data.parameters));
  const dropped = parseParameters(before.parameters).filter((p) => !kept.has(p));
  if (dropped.length > 0) {
    const used = await db.misQcCheck.findMany({ where: { templateId: id, parameterName: { in: dropped } }, select: { parameterName: true }, distinct: ['parameterName'] });
    if (used.length > 0) {
      throw new Error(`Cannot rename or remove "${used.map((u) => u.parameterName).join('", "')}": checks are already recorded against it. Keep it as is and add a new parameter instead.`);
    }
  }
  const after = await db.misQcTemplate.update({ where: { id }, data });
  await logAuditEvent({ actorId: actor.userId, action: 'qc_template.update', entity: 'MisQcTemplate', entityId: id, before, after });
  return toRow(after);
}

export async function setQcTemplateActive(id: string, isActive: boolean): Promise<void> {
  const actor = await requirePermission('settings.write');
  const before = await db.misQcTemplate.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw new Error('Template not found');
  const wasActive = before.isActive;
  const after = await db.misQcTemplate.update({ where: { id }, data: { isActive } });
  await logAuditEvent({ actorId: actor.userId, action: isActive ? 'qc_template.activate' : 'qc_template.deactivate', entity: 'MisQcTemplate', entityId: id, before: { isActive: wasActive }, after: { isActive: after.isActive } });
}

/** Move a template one place up or down the list. Positions are renumbered 0..n so ties from seeding cannot stall a move. */
export async function moveQcTemplate(id: string, direction: 'up' | 'down'): Promise<void> {
  const actor = await requirePermission('settings.write');
  const all = await db.misQcTemplate.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  const index = all.findIndex((t) => t.id === id);
  if (index < 0) throw new Error('Template not found');
  const ordered = moveItem(all, index, direction);
  const changed = ordered.map((t, i) => ({ t, i })).filter(({ t, i }) => t.sortOrder !== i);
  if (changed.length === 0) return;
  await db.$transaction(changed.map(({ t, i }) => db.misQcTemplate.update({ where: { id: t.id }, data: { sortOrder: i } })));
  await logAuditEvent({
    actorId: actor.userId, action: 'qc_template.reorder', entity: 'MisQcTemplate', entityId: id,
    before: { order: all.map((t) => t.id) }, after: { order: ordered.map((t) => t.id), direction },
  });
}

/** Move one parameter (a row on the form) up or down within its template. Names are untouched, so history stays attached. */
export async function moveQcParameter(id: string, parameter: string, direction: 'up' | 'down'): Promise<QcTemplateRow> {
  const actor = await requirePermission('settings.write');
  const before = await db.misQcTemplate.findUnique({ where: { id } });
  if (!before || before.deletedAt) throw new Error('Template not found');
  const list = parseParameters(before.parameters);
  const index = list.indexOf(parameter);
  if (index < 0) throw new Error('That parameter is not on this template.');
  const next = moveItem(list, index, direction);
  if (next.join('\n') === list.join('\n')) return toRow(before);
  const after = await db.misQcTemplate.update({ where: { id }, data: { parameters: next as unknown as Prisma.InputJsonValue } });
  await logAuditEvent({ actorId: actor.userId, action: 'qc_template.reorder_parameters', entity: 'MisQcTemplate', entityId: id, before: { parameters: list }, after: { parameters: next } });
  return toRow(after);
}

/** Re-create any of the four paper forms that is missing. Existing rows (edited or not) are left alone. */
export async function seedQcTemplates(): Promise<{ created: number }> {
  const actor = await requirePermission('settings.write');
  const existing = new Set((await db.misQcTemplate.findMany({ select: { name: true } })).map((t) => t.name));
  const missing = DEFAULT_QC_TEMPLATES.filter((t) => !existing.has(t.name) && !existing.has(LEGACY_QC_TEMPLATE_NAMES[t.name] ?? ''));
  if (missing.length > 0) {
    await db.misQcTemplate.createMany({
      data: missing.map((t) => ({ name: t.name, processName: t.processName, slotStart: t.slotStart, slotEnd: t.slotEnd, parameters: t.parameters as unknown as Prisma.InputJsonValue, sortOrder: DEFAULT_QC_TEMPLATES.indexOf(t) })),
    });
  }
  await logAuditEvent({ actorId: actor.userId, action: 'qc_template.seed', entity: 'MisQcTemplate', after: { created: missing.map((t) => t.name) } });
  return { created: missing.length };
}

/** One tap on the checklist: a QC check in that parameter and slot, carrying the template. */
export async function recordChecklistCheck(input: { orderId: string; templateId: string; parameterName: string; slotTime: string; status: ChecklistStatus; notes?: string }) {
  await requirePermission('qc.write');
  if (!(CHECKLIST_STATUSES as readonly string[]).includes(input.status)) throw new Error(`Unknown status ${String(input.status)}`);
  const template = await db.misQcTemplate.findUnique({ where: { id: input.templateId } });
  if (!template || !template.isActive || template.deletedAt) throw new Error('That checklist form is no longer active.');
  if (!parseParameters(template.parameters).includes(input.parameterName)) throw new Error('That parameter is not on this template.');
  if (!slotTimes(template.slotStart, template.slotEnd).includes(input.slotTime)) throw new Error('That slot is not on this template.');
  return addQcCheck({
    orderId: input.orderId,
    parameterName: input.parameterName,
    ...checklistStatusToCheck(input.status),
    notes: input.notes,
    templateId: input.templateId,
    slotTime: input.slotTime,
  }, { requireFailReason: false });
}
