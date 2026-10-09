import type { Prisma } from '@/generated/prisma/client';
import {
  CHECKLIST_STATUSES,
  DEFAULT_QC_TEMPLATES,
  checklistStatusToCheck,
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
  const after = await db.misQcTemplate.update({ where: { id }, data: validated(input) });
  await logAuditEvent({ actorId: actor.userId, action: 'qc_template.update', entity: 'MisQcTemplate', entityId: id, before, after });
  return toRow(after);
}

export async function setQcTemplateActive(id: string, isActive: boolean): Promise<void> {
  const actor = await requirePermission('settings.write');
  await db.misQcTemplate.update({ where: { id }, data: { isActive } });
  await logAuditEvent({ actorId: actor.userId, action: isActive ? 'qc_template.activate' : 'qc_template.deactivate', entity: 'MisQcTemplate', entityId: id, after: { isActive } });
}

/** Re-create any of the four paper forms that is missing. Existing rows (edited or not) are left alone. */
export async function seedQcTemplates(): Promise<{ created: number }> {
  const actor = await requirePermission('settings.write');
  const existing = new Set((await db.misQcTemplate.findMany({ select: { name: true } })).map((t) => t.name));
  const missing = DEFAULT_QC_TEMPLATES.filter((t) => !existing.has(t.name));
  if (missing.length > 0) {
    await db.misQcTemplate.createMany({
      data: missing.map((t, i) => ({ name: t.name, processName: t.processName, slotStart: t.slotStart, slotEnd: t.slotEnd, parameters: t.parameters as unknown as Prisma.InputJsonValue, sortOrder: DEFAULT_QC_TEMPLATES.indexOf(t) + i })),
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
  if (!template) throw new Error('Template not found');
  if (!parseParameters(template.parameters).includes(input.parameterName)) throw new Error('That parameter is not on this template.');
  if (!slotTimes(template.slotStart, template.slotEnd).includes(input.slotTime)) throw new Error('That slot is not on this template.');
  return addQcCheck({
    orderId: input.orderId,
    parameterName: input.parameterName,
    ...checklistStatusToCheck(input.status),
    notes: input.notes,
    templateId: input.templateId,
    slotTime: input.slotTime,
  });
}
