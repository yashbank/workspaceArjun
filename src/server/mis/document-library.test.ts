/**
 * Phase 24E · D13 — `getDocumentLibrary` and `saveDocumentLink` at the SERVER FUNCTION.
 *
 * The read is `orders.read` (OWNER, ADMIN, SUPERVISOR, QC) and the write `orders.write`; all eight roles are tried and a
 * refused role reaches no query. Documents are scoped through `resolveVisibleOrderWhere` (D4/D5) — composed with the
 * search, the group and the open-file lookup, so an order the caller may not see never leaks a document, even by id.
 * A link that is not http(s) or a site path is refused on the SERVER, and never becomes an `href`. No money.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MIS_ROLES, type MisRoleName } from '@/lib/mis/roles';

type Row = Record<string, unknown>;
type Doc = { id: string; orderId: string; name: string; description: string | null; filePath: string; fileSize: number | null; mimeType: string | null; uploadedBy: string | null; createdAt: Date };
const queries: string[] = [];
const seen: Row[] = [];
const listOrders: unknown[] = [];
const audits: Row[] = [];
const world: { zone: string; visible: Row; docs: Doc[]; orders: Row[]; profiles: Row[] } = { zone: 'Asia/Kolkata', visible: {}, docs: [], orders: [], profiles: [] };

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const orderOf = (d: Doc) => world.orders.find((o) => o.id === d.orderId) ?? null;

/** A small evaluator for exactly the where-shapes the server composes. Unknown shapes throw — never silently match. */
function matches(d: Doc, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Row[]).every((c) => matches(d, c));
    if (key === 'OR') return (cond as Row[]).some((c) => matches(d, c));
    if (key === 'order') {
      const o = orderOf(d);
      return !!o && Object.entries(cond as Row).every(([k, c]) => field(o[k], c));
    }
    return field((d as unknown as Row)[key], cond);
  });
}
function field(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null;
  if (typeof cond !== 'object' || cond instanceof Date) return value === cond;
  const c = cond as Row;
  return Object.entries(c).every(([op, arg]) => {
    if (op === 'mode') return true;
    if (op === 'in') return (arg as unknown[]).includes(value);
    if (op === 'contains') return typeof value === 'string' && value.toLowerCase().includes(String(arg).toLowerCase());
    if (op === 'gte') return (value as Date).getTime() >= (arg as Date).getTime();
    if (op === 'equals') return value === arg;
    throw new Error(`fake db: unsupported operator ${op}`);
  });
}
const withOrder = (d: Doc) => ({ ...d, order: orderOf(d) });

vi.mock('@/server/db', () => ({
  db: {
    misDocument: {
      groupBy: async (a: { where: Row }) => {
        queries.push('groupBy'); seen.push(a.where);
        const by = new Map<string | null, { count: number; sized: number; bytes: number }>();
        for (const d of world.docs.filter((x) => matches(x, a.where))) {
          const t = by.get(d.mimeType) ?? { count: 0, sized: 0, bytes: 0 };
          t.count += 1; if (d.fileSize !== null) { t.sized += 1; t.bytes += d.fileSize; } by.set(d.mimeType, t);
        }
        return [...by].map(([mimeType, t]) => ({ mimeType, _count: { _all: t.count, fileSize: t.sized }, _sum: { fileSize: t.sized ? t.bytes : null } }));
      },
      findMany: async (a: { where: Row; orderBy?: unknown; skip?: number; take?: number; select?: Row }) => {
        queries.push('docs'); seen.push(a.where); listOrders.push(a.orderBy);
        const rows = world.docs.filter((x) => matches(x, a.where)).sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime() || y.id.localeCompare(x.id));
        return rows.slice(a.skip ?? 0, (a.skip ?? 0) + (a.take ?? rows.length)).map(withOrder);
      },
      count: async (a: { where: Row }) => { queries.push('count'); seen.push(a.where); return world.docs.filter((x) => matches(x, a.where)).length; },
      findFirst: async (a: { where: Row }) => { queries.push('doc'); seen.push(a.where); const d = world.docs.find((x) => matches(x, a.where)); return d ? withOrder(d) : null; },
      create: async ({ data }: { data: Row }) => { const d = { id: U(900 + world.docs.length), description: null, fileSize: null, mimeType: null, createdAt: new Date(), ...data } as Doc; world.docs.push(d); return d; },
    },
    misOrder: {
      findFirst: async (a: { where: { AND: Row[] } }) => { queries.push('order'); const [vis, byId] = a.where.AND as [Row, { id: string }]; return world.orders.find((o) => o.id === byId.id && Object.entries(vis).every(([k, v]) => o[k] === v)) ?? null; },
      findMany: async (a: { where: Row }) => { queries.push('orders'); return world.orders.filter((o) => Object.entries(a.where).every(([k, v]) => o[k] === v)); },
    },
    userProfile: { findMany: async (a: { where: { authId: { in: string[] } } }) => { queries.push('profiles'); return world.profiles.filter((p) => a.where.authId.in.includes(p.authId as string)); } },
    misAuditLog: { create: async ({ data }: { data: Row }) => void audits.push(data) },
  },
}));
const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => world.zone }));
vi.mock('@/server/mis/visibility', () => ({ resolveVisibleOrderWhere: async () => world.visible }));

const { getDocumentLibrary, saveDocumentLink } = await import('./document-library');

const NOW = new Date('2026-09-10T10:00:00Z');
const at = (iso: string) => new Date(`${iso}+05:30`);
const READERS: MisRoleName[] = ['OWNER', 'ADMIN', 'SUPERVISOR', 'QC'];
const WRITERS: MisRoleName[] = ['OWNER', 'ADMIN'];
const as = (role: MisRoleName) => { getCurrentUser.mockResolvedValue({ id: 'u1', authId: 'auth-1' }); getMisRole.mockResolvedValue(role); };
const forbidden = async (fn: () => Promise<unknown>) => { try { await fn(); return false; } catch (e) { return (e as Error).name === 'MisForbiddenError'; } };
const doc = (n: number, over: Partial<Doc> = {}): Doc => ({ id: U(n), orderId: U(101), name: `Doc ${n}`, description: null, filePath: `https://files.example.com/doc-${n}.pdf`, fileSize: 1024 * n, mimeType: 'application/pdf', uploadedBy: 'auth-1', createdAt: at('2026-09-05T10:00:00'), ...over });

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0; seen.length = 0; audits.length = 0; listOrders.length = 0;
  world.zone = 'Asia/Kolkata';
  world.visible = {};
  world.orders = [{ id: U(101), orderNumber: 'ORD-2026-118', description: 'Duplex carton', team: 'a' }, { id: U(102), orderNumber: 'ORD-2026-109', description: null, team: 'b' }];
  world.profiles = [{ authId: 'auth-1', name: 'A. Bhaskar', email: 'a@x.test' }];
  world.docs = [
    doc(1, { name: 'Customer PO scan', mimeType: 'application/pdf', fileSize: 318 * 1024, createdAt: at('2026-08-28T09:00:00') }),
    doc(2, { name: 'Approved shade sample', mimeType: 'image/jpeg', fileSize: 2048, orderId: U(102), createdAt: at('2026-09-02T09:00:00') }),
    doc(3, { name: 'Supplier note', mimeType: 'text/plain', fileSize: null, filePath: '/files/note.txt', createdAt: at('2026-09-05T09:00:00') }),
    doc(4, { name: 'Untyped scan', mimeType: null, fileSize: null, uploadedBy: null, createdAt: at('2026-09-08T09:00:00') }),
    doc(5, { name: 'Bad link', mimeType: 'application/pdf', filePath: 'javascript:alert(1)', createdAt: at('2026-09-09T09:00:00') }),
  ];
});

describe('who may read the library — every role tried', () => {
  it.each(MIS_ROLES.map((r) => [r] as const))('%s', async (role) => {
    as(role);
    if (READERS.includes(role)) await expect(getDocumentLibrary({}, NOW)).resolves.toMatchObject({ totals: { files: 5 } });
    else {
      expect(await forbidden(() => getDocumentLibrary({}, NOW))).toBe(true);
      expect(queries).toEqual([]); // a refused role reaches no query at all
    }
  });
});

describe('who may add a document — every role tried', () => {
  const input = { orderId: U(101), name: 'COA', link: 'https://files.example.com/coa.pdf' };
  it.each(MIS_ROLES.map((r) => [r] as const))('%s', async (role) => {
    as(role);
    const before = world.docs.length;
    if (WRITERS.includes(role)) {
      await expect(saveDocumentLink(input)).resolves.toBeDefined();
      expect(world.docs).toHaveLength(before + 1);
      expect(audits).toHaveLength(1);
    } else {
      expect(await forbidden(() => saveDocumentLink(input))).toBe(true);
      expect(world.docs).toHaveLength(before);
      expect(audits).toHaveLength(0);
      expect(queries).toEqual([]);
    }
  });

  it('canWrite on the view follows orders.write, so the Add button is absent (not disabled) for a QC or Supervisor reader', async () => {
    as('QC');
    expect((await getDocumentLibrary({}, NOW)).canWrite).toBe(false);
    as('SUPERVISOR');
    expect((await getDocumentLibrary({}, NOW)).canWrite).toBe(false);
    as('OWNER');
    expect((await getDocumentLibrary({}, NOW)).canWrite).toBe(true);
  });
});

describe('the totals and groups', () => {
  it('counts files, sums only the sizes that were recorded, and counts the files with none', async () => {
    as('OWNER');
    const v = await getDocumentLibrary({}, NOW);
    expect(v.totals).toEqual({ files: 5, recordedBytes: 318 * 1024 + 2048 + 1024 * 5, unsized: 2, byGroup: { pdf: 2, image: 1, other: 1, untyped: 1 } });
  });

  it.each([['pdf', ['Bad link', 'Customer PO scan']], ['image', ['Approved shade sample']], ['other', ['Supplier note']], ['untyped', ['Untyped scan']]] as const)('the %s group lists exactly its own files, newest first', async (group, names) => {
    as('OWNER');
    const v = await getDocumentLibrary({ group }, NOW);
    expect(v.rows.map((r) => r.name)).toEqual(names);
    expect(v.matching).toBe(names.length);
  });

  it('"this month" is the FACTORY month: 31 Aug 23:30 IST is August, 1 Sep 00:10 IST is September — whatever UTC says', async () => {
    as('OWNER');
    world.docs = [doc(1, { name: 'Aug late', createdAt: at('2026-08-31T23:30:00') }), doc(2, { name: 'Sep early', createdAt: at('2026-09-01T00:10:00') }), doc(3, { name: 'Sep', createdAt: at('2026-09-07T10:00:00') })];
    const v = await getDocumentLibrary({ group: 'month' }, NOW);
    expect(v.rows.map((r) => r.name)).toEqual(['Sep', 'Sep early']);
    expect(v.monthCount).toBe(2);
  });

  it('an unknown group is "all"', async () => {
    as('OWNER');
    expect((await getDocumentLibrary({ group: 'generated' }, NOW)).matching).toBe(5);
  });
});

describe('search — by order, name, description or link; a wildcard is just text', () => {
  it.each([
    ['ORD-2026-109', ['Approved shade sample']],
    ['duplex', ['Bad link', 'Untyped scan', 'Supplier note', 'Customer PO scan']],
    ['shade', ['Approved shade sample']],
    ['note.txt', ['Supplier note']],
    ['no-such-thing', []],
  ] as const)('%s', async (q, names) => {
    as('OWNER');
    expect((await getDocumentLibrary({ q }, NOW)).rows.map((r) => r.name)).toEqual(names);
  });

  it('a search is capped at 60 characters and non-text is ignored', async () => {
    as('OWNER');
    expect((await getDocumentLibrary({ q: 'x'.repeat(300) }, NOW)).query).toHaveLength(60);
    expect((await getDocumentLibrary({ q: ['a'] }, NOW)).query).toBe('');
  });
});

describe('order', () => {
  it('the list is asked for newest first, with the id as the tie-break — not left to the database\'s whim', async () => {
    as('OWNER');
    await getDocumentLibrary({}, NOW);
    expect(listOrders.filter(Boolean)).toContainEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});

describe('paging', () => {
  it('50 to a page, newest first, and a page past the end is the last page', async () => {
    as('OWNER');
    world.docs = Array.from({ length: 120 }, (_, i) => doc(i + 1, { createdAt: new Date(at('2026-09-01T00:00:00').getTime() + i * 60_000) }));
    const p1 = await getDocumentLibrary({}, NOW);
    expect([p1.rows.length, p1.pageCount, p1.matching]).toEqual([50, 3, 120]);
    expect(p1.rows[0].name).toBe('Doc 120');
    const p3 = await getDocumentLibrary({ page: '3' }, NOW);
    expect([p3.rows.length, p3.page]).toEqual([20, 3]);
    expect((await getDocumentLibrary({ page: '99' }, NOW)).page).toBe(3);
    expect((await getDocumentLibrary({ page: 'x' }, NOW)).page).toBe(1);
  });
});

describe('the open file', () => {
  it('is the one asked for, else the newest; an id that is not a uuid is ignored without a query for it', async () => {
    as('OWNER');
    expect((await getDocumentLibrary({ doc: U(1) }, NOW)).selected?.name).toBe('Customer PO scan');
    queries.length = 0;
    expect((await getDocumentLibrary({ doc: "x' OR 1=1" }, NOW)).selected?.name).toBe('Bad link');
    expect(queries).not.toContain('doc');
  });

  it('carries the honest detail: uploader by name, factory time, type and size — or "not recorded" (null)', async () => {
    as('OWNER');
    const full = (await getDocumentLibrary({ doc: U(1) }, NOW)).selected!;
    expect(full).toMatchObject({ orderNumber: 'ORD-2026-118', addedFull: '28/08/2026 09:00', addedBy: 'A. Bhaskar', size: '318 KB', mimeType: 'application/pdf', family: 'pdf' });
    const bare = (await getDocumentLibrary({ doc: U(4) }, NOW)).selected!;
    expect(bare).toMatchObject({ addedBy: null, size: null, mimeType: null, family: 'untyped' });
  });

  it('a link is followable only when safe: https and a site path yes; javascript: never', async () => {
    as('OWNER');
    expect((await getDocumentLibrary({ doc: U(1) }, NOW)).selected!.href).toBe('https://files.example.com/doc-1.pdf');
    expect((await getDocumentLibrary({ doc: U(3) }, NOW)).selected!.href).toBe('/files/note.txt');
    const bad = (await getDocumentLibrary({ doc: U(5) }, NOW)).selected!;
    expect(bad.href).toBeNull();
    expect(bad.link).toBe('javascript:alert(1)'); // shown as text, so the person can see what was pasted
  });

  it('an empty library has nothing selected', async () => {
    as('OWNER');
    world.docs = [];
    expect(await getDocumentLibrary({}, NOW)).toMatchObject({ selected: null, rows: [], matching: 0, totals: { files: 0 } });
  });
});

describe('scoping — every document query goes through the order-visibility seam (D4/D5)', () => {
  beforeEach(() => { world.visible = { team: 'a' }; });

  it('an order the caller may not see contributes no document, no count, no size and no search hit', async () => {
    as('ADMIN');
    const v = await getDocumentLibrary({}, NOW);
    expect(v.rows.map((r) => r.name)).not.toContain('Approved shade sample');
    expect(v.totals.files).toBe(4);
    expect(v.totals.byGroup.image).toBe(0);
    expect((await getDocumentLibrary({ q: 'shade' }, NOW)).rows).toEqual([]);
    expect((await getDocumentLibrary({ group: 'image' }, NOW)).rows).toEqual([]);
    expect((await getDocumentLibrary({ group: 'month' }, NOW)).rows.map((r) => r.name)).not.toContain('Approved shade sample');
  });

  it('opening a hidden document BY ID does not show it — the newest visible one is opened instead', async () => {
    as('ADMIN');
    expect((await getDocumentLibrary({ doc: U(2) }, NOW)).selected?.name).toBe('Bad link');
  });

  it('every query that touches documents carries the seam', async () => {
    as('ADMIN');
    await getDocumentLibrary({ q: 'a', group: 'pdf', doc: U(1) }, NOW);
    expect(seen.length).toBeGreaterThanOrEqual(5);
    for (const where of seen) expect(JSON.stringify(where)).toContain('"team":"a"');
  });

  it('the add form lists only the orders the caller may see; a hidden order cannot be attached to', async () => {
    as('ADMIN');
    expect((await getDocumentLibrary({ add: '1' }, NOW)).add?.orders.map((o) => o.label)).toEqual(['ORD-2026-118 — Duplex carton']);
    await expect(saveDocumentLink({ orderId: U(102), name: 'X', link: 'https://x.example/a.pdf' })).rejects.toThrow(/not found/);
    expect(world.docs).toHaveLength(5);
  });
});

describe('the add form and the notice', () => {
  it('the add panel is open only when asked, and only for a role that may add', async () => {
    as('OWNER');
    expect((await getDocumentLibrary({}, NOW)).add).toBeNull();
    expect((await getDocumentLibrary({ add: '1' }, NOW)).add).not.toBeNull();
    expect((await getDocumentLibrary({ add: 'yes' }, NOW)).add).toBeNull();
    as('QC');
    expect((await getDocumentLibrary({ add: '1' }, NOW)).add).toBeNull();
  });

  it('the "added" notice appears only for added=1', async () => {
    as('OWNER');
    expect((await getDocumentLibrary({ added: '1' }, NOW)).notice).toBe('added');
    expect((await getDocumentLibrary({ added: '0' }, NOW)).notice).toBeNull();
  });
});

describe('saveDocumentLink — the one write', () => {
  const ok = { orderId: U(101), name: '  COA March  ', description: ' for the customer ', link: ' https://files.example.com/coa.pdf ' };

  it('attaches a trimmed link through addDocument, which writes the audit row', async () => {
    as('OWNER');
    await saveDocumentLink(ok);
    const rec = world.docs[world.docs.length - 1];
    expect(rec).toMatchObject({ orderId: U(101), name: 'COA March', description: 'for the customer', filePath: 'https://files.example.com/coa.pdf', uploadedBy: 'auth-1' });
    expect(audits).toEqual([expect.objectContaining({ action: 'ADD_DOCUMENT', entity: 'MisDocument', actorId: 'u1' })]);
  });

  it.each([
    ['a script link', { link: 'javascript:alert(1)' }, /http\(s\)/],
    ['a data link', { link: 'data:text/html,x' }, /http\(s\)/],
    ['no name', { name: ' ' }, /needs a name/],
    ['no link', { link: '' }, /needs a link/],
    ['no order', { orderId: '' }, /Choose the order/],
    ['an order id that is not a uuid (and no order query is made for it)', { orderId: "1' OR '1'='1" }, /not found/],
    ['an order that does not exist', { orderId: U(777) }, /not found/],
  ])('%s is refused on the server and writes nothing', async (_n, over, message) => {
    as('OWNER');
    await expect(saveDocumentLink({ ...ok, ...over })).rejects.toThrow(message);
    if (String((over as { orderId?: string }).orderId ?? '').includes("'")) expect(queries).not.toContain('order');
    expect(world.docs).toHaveLength(5);
    expect(audits).toHaveLength(0);
  });
});

describe('no money', () => {
  it('nothing the library returns carries a price, rate or wage — for the Owner or anyone', async () => {
    for (const role of READERS) {
      as(role);
      const v = await getDocumentLibrary({ doc: U(1), add: '1' }, NOW);
      const keys = new Set<string>();
      const walk = (x: unknown) => { if (x && typeof x === 'object') for (const [k, y] of Object.entries(x)) { keys.add(k); walk(y); } };
      walk(v);
      expect([...keys].filter((k) => /price|^rate|Rate|wage|cost|salary|amount/.test(k))).toEqual([]);
    }
  });
});
