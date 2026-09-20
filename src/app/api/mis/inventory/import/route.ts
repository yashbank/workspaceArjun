import { NextRequest, NextResponse } from 'next/server';
import { requireMisAccess } from '@/server/mis/guard';
import { requirePermission } from '@/server/mis/auth';
import { db } from '@/server/db';
import { logAuditEvent } from '@/server/mis/audit';
import { MisItemCategory, MisItemUnit } from '@/generated/prisma/enums';
import * as XLSX from 'xlsx';

const VALID_CATEGORIES = new Set<string>(Object.values(MisItemCategory));
const VALID_UNITS = new Set<string>(Object.values(MisItemUnit));

export async function POST(req: NextRequest) {
  await requireMisAccess();
  const actor = await requirePermission('masters.write');

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!['csv', 'xlsx'].includes(ext ?? ''))
    return NextResponse.json({ error: 'Only .csv or .xlsx files are supported' }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][];

  if (rows.length < 2) return NextResponse.json({ error: 'File is empty or has no data rows' }, { status: 400 });

  const headerRow = rows[0].map((h: unknown) => String(h).toLowerCase().replace(/[\s\/]+/g, '_'));
  const col = (candidates: string[]) => {
    for (const c of candidates) { const i = headerRow.findIndex(h => h.includes(c)); if (i >= 0) return i; }
    return -1;
  };
  const colCode = col(['code']); const colName = col(['name']); const colSku = col(['sku']);
  const colCat = col(['category', 'cat']); const colUnit = col(['unit']); const colPrice = col(['price']);

  if (colName < 0) return NextResponse.json({ error: 'Sheet must have a "Name" column' }, { status: 400 });

  const results: { row: number; code: string; status: 'created' | 'updated' | 'skipped'; reason?: string }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const get = (idx: number) => (idx >= 0 ? String(row[idx] ?? '').trim() : '');
    const name = get(colName);
    if (!name || name.toLowerCase().startsWith('example')) continue;

    let code = get(colCode).toUpperCase() || undefined;
    const sku = get(colSku) || undefined;
    const catRaw = get(colCat).toUpperCase().replace(/\s+/g, '_');
    const unitRaw = get(colUnit).toUpperCase();
    const priceRaw = get(colPrice);
    const category = VALID_CATEGORIES.has(catRaw) ? (catRaw as MisItemCategory) : MisItemCategory.OTHER;
    const unit = VALID_UNITS.has(unitRaw) ? (unitRaw as MisItemUnit) : MisItemUnit.PIECE;
    const pricePerUnit = priceRaw && !isNaN(Number(priceRaw)) ? Number(priceRaw) : null;

    try {
      if (!code) {
        const count = await db.misItem.count();
        code = `ITM-${String(count + i).padStart(4, '0')}`;
      }
      const existing = await db.misItem.findFirst({ where: { OR: [{ code }, ...(sku ? [{ sku }] : [])] } });
      if (existing) {
        const updated = await db.misItem.update({ where: { id: existing.id }, data: { name, category, unit, ...(sku ? { sku } : {}), ...(pricePerUnit !== null ? { pricePerUnit } : {}), isDemo: false } });
        await logAuditEvent({ actorId: actor.userId, action: 'item.import_update', entity: 'MisItem', entityId: updated.id, after: { name, category, unit } });
        results.push({ row: i + 1, code: existing.code, status: 'updated' });
      } else {
        const created = await db.misItem.create({ data: { code, name, category, unit, sku: sku || null, pricePerUnit, isDemo: false } });
        await logAuditEvent({ actorId: actor.userId, action: 'item.import_create', entity: 'MisItem', entityId: created.id, after: { name, category, unit } });
        results.push({ row: i + 1, code, status: 'created' });
      }
    } catch (e: any) { results.push({ row: i + 1, code: code ?? '?', status: 'skipped', reason: e.message }); }
  }

  const created = results.filter(r => r.status === 'created').length;
  const updated = results.filter(r => r.status === 'updated').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  return NextResponse.json({ created, updated, skipped, results });
}
