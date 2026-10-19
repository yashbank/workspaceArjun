'use server';
import { adjustInventory } from '@/server/mis/inventory';
import { withoutMoneyFields } from '@/lib/mis/money-fields';
import { can } from '@/lib/mis/permissions';
import { asResult, type ActionResult } from '@/lib/mis/action-result';
import { requirePermission, checkPermission } from '@/server/mis/auth';
import { db } from '@/server/db';
import { logAuditEvent } from '@/server/mis/audit';
import { toItemUnit } from '@/server/mis/item';
import { createWithItemCode } from '@/server/mis/item-code';
import { listOptions, createOption } from '@/server/mis/master-option';
import { unitChoices, type OptionLike } from '@/lib/mis/item-options';
import { MisItemCategory } from '@/generated/prisma/enums';
import { revalidatePath } from 'next/cache';

export async function adjustInventoryAction(itemId: string, changeQty: number, notes?: string): Promise<ActionResult> {
  return asResult(async () => {
    await adjustInventory(itemId, changeQty, notes);
    revalidatePath('/mis/inventory');
  });
}

export interface CreateItemInput {
  name: string;
  code?: string;
  sku?: string;
  category: MisItemCategory;
  unit: string;
  pricePerUnit?: string;
  gsm?: string;
  size?: string;
  substrate?: string;
  coating?: string;
}

export async function createItemAction(input: CreateItemInput): Promise<ActionResult<{ id: string; code: string }>> {
  return asResult(async () => {
    const actor = await requirePermission('masters.write');
    const name = (input.name ?? '').trim();
    if (name.length < 1 || name.length > 120) throw new Error('Item name is required (1 to 120 characters).');
    // D5: the price is the Owner's (`wages.read`); an Admin's value is ignored, not trusted.
    const mayPrice = can(actor.role, 'wages.read');
    const pricePerUnit = mayPrice && input.pricePerUnit && !isNaN(Number(input.pricePerUnit)) ? Number(input.pricePerUnit) : null;

    const typed = (input.code ?? '').trim().toUpperCase();
    if (typed.length > 40) throw new Error('Item code is too long (max 40 characters).');
    const data = {
      name,
      sku: input.sku?.trim() || null,
      category: input.category,
      unit: toItemUnit(input.unit),
      gsm: input.gsm?.trim() || null,
      size: input.size?.trim() || null,
      substrate: input.substrate?.trim() || null,
      coating: input.coating?.trim() || null,
      pricePerUnit,
      isDemo: false,
    };
    const created = typed
      ? await db.misItem.create({ data: { code: typed, ...data } })
      : await createWithItemCode(db, (code) => db.misItem.create({ data: { code, ...data } }));

    await logAuditEvent({ actorId: actor.userId, action: 'item.create', entity: 'MisItem', entityId: created.id, after: mayPrice ? created : withoutMoneyFields(created) });
    revalidatePath('/mis/inventory');
    return { id: created.id, code: created.code };
  }, { entity: 'Item', fields: { code: (input.code ?? '').trim().toUpperCase(), sku: input.sku } });
}

export type ItemFormOptions = { gsm: OptionLike[]; size: OptionLike[]; substrate?: OptionLike[]; coating?: OptionLike[]; unit: OptionLike[]; canManage: boolean };

/** Active GSM / Size / Substrate / Coating / Unit master options for the item forms (R2-02/25/84/85). Plain data, no money. */
export async function getItemFormOptionsAction(): Promise<ActionResult<ItemFormOptions>> {
  return asResult(async () => {
    await requirePermission('masters.read');
    const [gsm, size, substrate, coating, unit, canManage] = await Promise.all([listOptions('GSM'), listOptions('SIZE'), listOptions('SUBSTRATE'), listOptions('COATING'), listOptions('UNIT'), checkPermission('masters.write')]);
    const plain = (rows: { value: string; label: string; isActive: boolean }[]) => rows.filter((r) => r.isActive).map((r) => ({ value: r.value, label: r.label }));
    return { gsm: plain(gsm), size: plain(size), substrate: plain(substrate), coating: plain(coating), unit: unitChoices(plain(unit), undefined, true), canManage };
  });
}

const ITEM_OPTION_GROUPS = ['GSM', 'SIZE', 'SUBSTRATE', 'COATING', 'UNIT'] as const;
export type ItemOptionGroup = (typeof ITEM_OPTION_GROUPS)[number];

/** Inline "add new option / unit" from an item form. Needs masters.write (Admin/Owner); audited by createOption. */
export async function addItemOptionAction(group: string, label: string): Promise<ActionResult<OptionLike>> {
  return asResult(async () => {
    if (!(ITEM_OPTION_GROUPS as readonly string[]).includes(group)) throw new Error('Unknown option group.');
    const clean = (label ?? '').trim();
    if (clean.length < 1 || clean.length > 40) throw new Error('Option name is required (1 to 40 characters).');
    const existing = (await listOptions(group)).find((o) => o.label.toLowerCase() === clean.toLowerCase());
    if (existing) return { value: existing.value, label: existing.label };
    const created = await createOption({ group, label: clean });
    return { value: created.value, label: created.label };
  });
}
