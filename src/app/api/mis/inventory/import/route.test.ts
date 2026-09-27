/**
 * Phase 15 · MIS-75 — item import edge cases against the real client workbook shape.
 *
 * The route (`route.ts`) does its own parsing and writes inline rather than delegating to a
 * `server/mis/` function — noted, not restructured (this phase is tests only, no app code).
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const state: { items: Row[] } = { items: [] };
let nextId = 1;

vi.mock('@/server/mis/guard', () => ({ requireMisAccess: vi.fn().mockResolvedValue({ id: 'u1' }) }));
vi.mock('@/server/mis/auth', () => ({ requirePermission: vi.fn().mockResolvedValue({ userId: 'u1', role: 'OWNER' }) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/db', () => ({
  db: {
    misItem: {
      count: async () => state.items.length,
      findFirst: async ({ where }: Row) => {
        const or: Row[] = where.OR;
        return state.items.find((i) => or.some((cond) => Object.entries(cond).every(([k, v]) => i[k] === v))) ?? null;
      },
      update: async ({ where, data }: Row) => {
        const row = state.items.find((i) => i.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }: Row) => {
        const row = { id: `item-${nextId++}`, ...data };
        state.items.push(row);
        return row;
      },
    },
  },
}));

const { POST } = await import('./route');

// jsdom's FormData/File round-trip through NextRequest.formData() unreliably (the filename is
// lost, so the route's own extension check always refuses) — building the multipart body by
// hand sidesteps the environment's polyfill entirely and is what actually crosses the wire.
const BOUNDARY = '----misImportTestBoundary';
function multipartRequest(filename: string, contentType: string, content: string) {
  const body =
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n` +
    `${content}\r\n` +
    `--${BOUNDARY}--\r\n`;
  return POST(
    new NextRequest('http://localhost/api/mis/inventory/import', {
      method: 'POST',
      headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      body,
    }),
  );
}

function csvRequest(csv: string) {
  return multipartRequest('items.csv', 'text/csv', csv);
}

beforeEach(() => {
  state.items = [];
  nextId = 1;
  vi.clearAllMocks();
});

describe('empty and malformed sheets', () => {
  it('an empty sheet (header row only, no data) is refused, not silently a no-op', async () => {
    const res = await csvRequest('Code,Name,Category,Unit,Price\n');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/empty|no data/i);
  });

  it('a sheet missing the required Name column is refused', async () => {
    const res = await csvRequest('Code,Category,Unit,Price\nX-1,RAW_MATERIAL,KG,10\n');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/name/i);
  });

  it('a non-csv/xlsx extension is refused before the file is even read', async () => {
    const res = await multipartRequest('items.txt', 'text/plain', 'not a sheet');
    expect(res.status).toBe(400);
  });
});

describe('the 146-row happy path', () => {
  it('every real row is created, in order, none skipped', async () => {
    const header = 'Code,Name,Category,Unit,Price';
    const rows = Array.from({ length: 146 }, (_, i) => `RM-${i + 1},Material ${i + 1},RAW_MATERIAL,KG,${i + 1}`);
    const res = await csvRequest([header, ...rows].join('\n'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ created: 146, updated: 0, skipped: 0 });
    expect(state.items).toHaveLength(146);
  });

  it('a row whose name starts with "example" is a template placeholder, not data — silently excluded, not counted at all', async () => {
    const res = await csvRequest('Code,Name,Category,Unit,Price\nX-1,Example item,RAW_MATERIAL,KG,10\nX-2,Real item,RAW_MATERIAL,KG,10\n');
    const body = await res.json();
    expect(body).toMatchObject({ created: 1 });
    expect(state.items).toHaveLength(1);
    expect(state.items[0].name).toBe('Real item');
  });
});

describe('a duplicate code/SKU within the same file', () => {
  it('the second occurrence UPDATES the first-created row rather than throwing or duplicating it', async () => {
    const res = await csvRequest('Code,Name,Category,Unit,Price\nDUP-1,First pass,RAW_MATERIAL,KG,10\nDUP-1,Second pass,RAW_MATERIAL,KG,20\n');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ created: 1, updated: 1, skipped: 0 });
    expect(state.items).toHaveLength(1); // never two rows for one code
    expect(state.items[0].name).toBe('Second pass'); // the later row won, not silently dropped
  });

  it('matching by SKU alone (no code repeated) also updates, not duplicates', async () => {
    const res = await csvRequest('Sku,Name,Category,Unit,Price\nSKU-1,First,RAW_MATERIAL,KG,10\nSKU-1,Second,RAW_MATERIAL,KG,20\n');
    const body = await res.json();
    expect(body).toMatchObject({ created: 1, updated: 1 });
    expect(state.items).toHaveLength(1);
  });
});

describe('a wrong or unrecognised unit string', () => {
  it('falls back to the default unit (PIECE) rather than refusing the row', async () => {
    const res = await csvRequest('Code,Name,Category,Unit,Price\nX-1,Widget,RAW_MATERIAL,GALLONS,10\n');
    const body = await res.json();
    expect(body).toMatchObject({ created: 1 });
    expect(state.items[0].unit).toBe('PIECE');
  });

  it('an unrecognised category falls back to OTHER the same way', async () => {
    const res = await csvRequest('Code,Name,Category,Unit,Price\nX-1,Widget,NOT_A_CATEGORY,KG,10\n');
    await res.json();
    expect(state.items[0].category).toBe('OTHER');
  });
});

describe("an item code containing '/' (MIS_UI_SPEC §3: codes use '-', a '/' breaks URL encoding)", () => {
  // F-36: the import route neither rejects nor normalises a '/' in the code — it is stored
  // verbatim. This case is the spec-correct behaviour, so it stays red until that is fixed.
  it.fails('a code with a slash is rejected, or the slash is normalised to a hyphen — never stored verbatim', async () => {
    const res = await csvRequest('Code,Name,Category,Unit,Price\nRM/01,Slashed code,RAW_MATERIAL,KG,10\n');
    await res.json();
    expect(state.items[0].code).not.toMatch(/\//);
  });
});
