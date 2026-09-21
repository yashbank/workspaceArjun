/**
 * D13's document library — the desktop half of the page the phone already serves.
 *
 * The phone screen picks an order and lists ITS documents (`listDocuments`). The library reads across orders, so
 * that one does not fit and this adds one read: `getDocumentLibrary`, gated on `orders.read` (the same permission
 * `listDocuments` asks) and scoped through `resolveVisibleOrderWhere` — the single seam D4/D5 narrow. D5 decided
 * that only PEOPLE narrow by pool and orders do not, so the seam is `{}` today; it is composed anyway, so the
 * day that changes a document follows its order with no edit here. A document is tied to an order, not to a
 * person; the only person on a row is the uploader's display name, exactly as the phone list shows it.
 *
 * `saveDocumentLink` is the one write: it reuses `addDocument` (gate `orders.write`, audit `ADD_DOCUMENT`) and adds
 * only what that function does not check — that the order is visible to the caller and that the link is safe to
 * follow. **No money:** a document has no price or wage, and none is selected.
 */

import type { Prisma } from '@/generated/prisma/client';
import { can } from '@/lib/mis/permissions';
import {
  DOC_PAGE_SIZE, EMPTY_LIBRARY, mimeFamily, normaliseQuery, parseGroup, parsePage, safeHref, sizeLabel, totalsFrom, validateDocumentInput,
  type DocDetailView, type DocLibraryView, type DocRowView, type OrderOption, type TypeTally,
} from '@/lib/mis/document-library';
import { dateKeyToDbDate, factoryDateKey, formatFactoryTime } from '@/lib/mis/factory-time';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getFactoryTimezone } from '@/server/mis/business-rules';
import { addDocument, withUploaderNames } from '@/server/mis/documents';
import { resolveVisibleOrderWhere } from '@/server/mis/visibility';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const docSelect = {
  id: true, orderId: true, name: true, description: true, filePath: true, fileSize: true, mimeType: true, uploadedBy: true, createdAt: true,
  order: { select: { orderNumber: true, description: true } },
} satisfies Prisma.MisDocumentSelect;

type DocRow = Prisma.MisDocumentGetPayload<{ select: typeof docSelect }>;

const dmy = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;

function rowView(d: DocRow, timeZone: string): DocRowView {
  return {
    id: d.id,
    name: d.name,
    orderId: d.orderId,
    orderNumber: d.order.orderNumber,
    orderDescription: d.order.description,
    family: mimeFamily(d.mimeType),
    addedLabel: dmy(factoryDateKey(d.createdAt, timeZone)),
    addedIso: d.createdAt.toISOString(),
    size: sizeLabel(d.fileSize),
    description: d.description,
  };
}

export async function getDocumentLibrary(
  input: { q?: unknown; group?: unknown; doc?: unknown; page?: unknown; add?: unknown; added?: unknown } = {},
  now: Date = new Date(),
): Promise<DocLibraryView> {
  const actor = await requirePermission('orders.read');
  const canWrite = can(actor.role, 'orders.write');
  const timeZone = await getFactoryTimezone();
  const visible = await resolveVisibleOrderWhere(actor);
  const query = normaliseQuery(input.q);
  const group = parseGroup(input.group);
  const base: Prisma.MisDocumentWhereInput = { order: visible };

  // One grouped count: files, recorded bytes and the files with no size, by recorded type.
  const grouped = await db.misDocument.groupBy({ by: ['mimeType'], where: base, _count: { _all: true, fileSize: true }, _sum: { fileSize: true } });
  const tallies: TypeTally[] = grouped.map((g) => ({ mimeType: g.mimeType, count: g._count._all, bytes: g._sum.fileSize ?? 0, sized: g._count.fileSize }));
  const totals = totalsFrom(tallies);

  // "This month" is the FACTORY's month (D22): read a loose window, keep what the factory calendar says.
  const monthPrefix = factoryDateKey(now, timeZone).slice(0, 7);
  const windowStart = new Date(dateKeyToDbDate(`${monthPrefix}-01`).getTime() - 14 * 3_600_000);
  const recent = await db.misDocument.findMany({ where: { AND: [base, { createdAt: { gte: windowStart } }] }, select: { id: true, createdAt: true } });
  const monthIds = recent.filter((r) => factoryDateKey(r.createdAt, timeZone).startsWith(monthPrefix)).map((r) => r.id);

  const clauses: Prisma.MisDocumentWhereInput[] = [base];
  if (group === 'month') clauses.push({ id: { in: monthIds } });
  else if (group !== 'all') {
    // The same family rule the counts use, expressed as the exact recorded types that belong to it.
    const types = tallies.filter((t) => mimeFamily(t.mimeType) === group).map((t) => t.mimeType);
    const named = types.filter((t): t is string => t !== null);
    clauses.push({ OR: [...(types.includes(null) ? [{ mimeType: null }] : []), { mimeType: { in: named } }] });
  }
  if (query !== '') {
    const has = { contains: query, mode: 'insensitive' as const };
    clauses.push({ OR: [{ name: has }, { description: has }, { filePath: has }, { order: { orderNumber: has } }, { order: { description: has } }] });
  }
  const where: Prisma.MisDocumentWhereInput = { AND: clauses };

  const matching = await db.misDocument.count({ where });
  const pageCount = Math.max(1, Math.ceil(matching / DOC_PAGE_SIZE));
  const page = Math.min(parsePage(input.page), pageCount);
  const rows = await db.misDocument.findMany({ where, select: docSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * DOC_PAGE_SIZE, take: DOC_PAGE_SIZE });

  // The open file: the one asked for (if it is visible), else the first in the list.
  let open: DocRow | null = null;
  if (typeof input.doc === 'string' && UUID.test(input.doc)) open = await db.misDocument.findFirst({ where: { AND: [base, { id: input.doc }] }, select: docSelect });
  open ??= rows[0] ?? null;

  let selected: DocDetailView | null = null;
  if (open) {
    const [withName] = await withUploaderNames([open]);
    const profile = withName.uploadedByProfile;
    selected = {
      ...rowView(open, timeZone),
      link: open.filePath,
      href: safeHref(open.filePath),
      mimeType: open.mimeType,
      addedFull: `${dmy(factoryDateKey(open.createdAt, timeZone))} ${formatFactoryTime(open.createdAt, timeZone)}`,
      addedBy: profile?.name?.trim() || null,
    };
  }

  let add: DocLibraryView['add'] = null;
  if (canWrite && input.add === '1') {
    const orders = await db.misOrder.findMany({ where: visible, select: { id: true, orderNumber: true, description: true }, orderBy: { createdAt: 'desc' }, take: 300 });
    add = { orders: orders.map((o): OrderOption => ({ id: o.id, label: `${o.orderNumber}${o.description ? ` — ${o.description}` : ''}` })) };
  }

  return {
    ...EMPTY_LIBRARY(),
    query, group, page, pageCount, totals, monthCount: monthIds.length, matching,
    rows: rows.map((r) => rowView(r, timeZone)), selected, canWrite, add,
    notice: input.added === '1' ? 'added' : null,
  };
}

/**
 * Attach a file link to an order. Gate `orders.write`; the order must be one the caller may see, and the link
 * must be safe to follow (`javascript:` is refused here, not only in the form). The write and its audit row are
 * `addDocument`'s.
 */
export async function saveDocumentLink(input: { orderId: string; name: string; description?: string; link: string }) {
  const actor = await requirePermission('orders.write');
  const invalid = validateDocumentInput(input);
  if (invalid) throw new Error(invalid);
  if (!UUID.test(input.orderId)) throw new Error('That order was not found.');
  const visible = await resolveVisibleOrderWhere(actor);
  const order = await db.misOrder.findFirst({ where: { AND: [visible, { id: input.orderId }] }, select: { id: true } });
  if (!order) throw new Error('That order was not found.');
  return addDocument(order.id, { name: input.name.trim(), description: input.description?.trim() || undefined, filePath: input.link.trim() });
}
