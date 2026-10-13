import { NextRequest, NextResponse } from 'next/server';
import { requireMisAccess } from '@/server/mis/guard';
import { can } from '@/lib/mis/permissions';
import { mapPrismaError } from '@/lib/mis/action-result';
import { requirePermission } from '@/server/mis/auth';
import { db } from '@/server/db';
import { logAuditEvent } from '@/server/mis/audit';
import { createWithItemCode } from '@/server/mis/item-code';
import { MisItemCategory, MisItemUnit } from '@/generated/prisma/enums';
import * as XLSX from 'xlsx';

const VALID_CATEGORIES = new Set<string>(Object.values(MisItemCategory));
const VALID_UNITS = new Set<string>(Object.values(MisItemUnit));

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 2000;

export async function POST(req: NextRequest) {
  await requireMisAccess();
  const actor = await requirePermission('masters.write');

  let file: File | null = null;
  try {
    const formData = await req.formData();
    file = formData.get('file') as File | null;
  } catch {
    return NextResponse.json({ error: 'Could not read the file' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx'].includes(ext ?? ''))
    return NextResponse.json({ error: 'Only .csv or .xlsx files are supported' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'File is too large (max 5 MB)' }, { status: 413 });

  let rows: string[][];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];
  } catch {
    return NextResponse.json({ error: 'Could not read the file' }, { status: 400 });
  }

  if (rows.length < 2) return NextResponse.json({ error: 'File is empty or has no data rows' }, { status: 400 });
  const dataRows = rows.slice(1).filter((r) => r.some((c) => String(c ?? '').trim() !== '')).length;
  if (dataRows > MAX_DATA_ROWS) return NextResponse.json({ error: `Too many rows (max ${MAX_DATA_ROWS} per file)` }, { status: 400 });

  const headerRow = rows[0].map((h: unknown) => String(h).toLowerCase().replace(/[\s\/]+/g, '_'));
  const col = (candidates: string[]) => {
    for (const c of candidates) { const i = headerRow.findIndex(h => h.includes(c)); if (i >= 0) return i; }
    return -1;
  };
  const colCode = col(['code']); const colName = col(['name']); const colSku = col(['sku']);
  const colCat = col(['category', 'cat']); const colUnit = col(['unit']); const colPrice = col(['price']);

  if (colName < 0) return NextResponse.json({ error: 'Sheet must have a "Name" column' }, { status: 400 });

  const mayPrice = can(actor.role, 'wages.read');
  const results: { row: number; code: string; status: 'created' | 'updated' | 'skipped'; reason?: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (idx: number) => (idx >= 0 ? String(row[idx] ?? '').trim() : '');
    const name = get(colName);
    if (!name || name.toLowerCase().startsWith('example')) continue;

    const typedCode = get(colCode).toUpperCase() || undefined;
    const sku = get(colSku) || undefined;
    const catRaw = get(colCat).toUpperCase().replace(/\s+/g, '_');
    const unitRaw = get(colUnit).toUpperCase();
    const priceRaw = get(colPrice);
    // Only a column that is present AND valid in this row may change a stored value.
    const category = VALID_CATEGORIES.has(catRaw) ? (catRaw as MisItemCategory) : undefined;
    const unit = VALID_UNITS.has(unitRaw) ? (unitRaw as MisItemUnit) : undefined;
    const pricePerUnit = mayPrice && priceRaw && !isNaN(Number(priceRaw)) ? Number(priceRaw) : null;
    const label = typedCode ?? sku ?? '?';

    if (name.length > 120) { results.push({ row: i + 1, code: label, status: 'skipped', reason: 'Name is too long (max 120 characters)' }); continue; }

    try {
      const matchers = [...(typedCode ? [{ code: typedCode }] : []), ...(sku ? [{ sku }] : [])];
      const existing = matchers.length ? await db.misItem.findFirst({ where: { OR: matchers } }) : null;
      if (existing) {
        if (existing.deletedAt || existing.isActive === false) {
          results.push({ row: i + 1, code: existing.code, status: 'skipped', reason: 'Item is deleted/inactive' });
          continue;
        }
        const oldPrice = existing.pricePerUnit == null ? null : Number(existing.pricePerUnit);
        const priceChanged = pricePerUnit !== null && pricePerUnit !== oldPrice;
        const updated = await db.misItem.update({
          where: { id: existing.id },
          data: { name, ...(category ? { category } : {}), ...(unit ? { unit } : {}), ...(sku ? { sku } : {}), ...(pricePerUnit !== null ? { pricePerUnit } : {}), isDemo: false },
        });
        // A price is OWNER-only money: it is only ever in the payload when the OWNER changed it, and the
        // audit read path strips `pricePerUnit` for every other role (redactAuditForRole).
        await logAuditEvent({
          actorId: actor.userId, action: 'item.import_update', entity: 'MisItem', entityId: updated.id,
          after: { name, ...(category ? { category } : {}), ...(unit ? { unit } : {}), pricePerUnit: priceChanged ? { from: oldPrice, to: pricePerUnit } : undefined },
        });
        results.push({ row: i + 1, code: existing.code, status: 'updated' });
      } else {
        const data = { name, category: category ?? MisItemCategory.OTHER, unit: unit ?? MisItemUnit.PIECE, sku: sku || null, pricePerUnit, isDemo: false };
        const created = typedCode
          ? await db.misItem.create({ data: { code: typedCode, ...data } })
          : await createWithItemCode(db, (code) => db.misItem.create({ data: { code, ...data } }));
        await logAuditEvent({
          actorId: actor.userId, action: 'item.import_create', entity: 'MisItem', entityId: created.id,
          after: { name, category: data.category, unit: data.unit, pricePerUnit: pricePerUnit !== null ? { from: null, to: pricePerUnit } : undefined },
        });
        results.push({ row: i + 1, code: created.code, status: 'created' });
      }
    } catch (e: unknown) {
      results.push({ row: i + 1, code: label, status: 'skipped', reason: mapPrismaError(e, { entity: 'Item', fields: { code: typedCode, sku } }) });
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const updated = results.filter(r => r.status === 'updated').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  return NextResponse.json({ created, updated, skipped, results });
}
