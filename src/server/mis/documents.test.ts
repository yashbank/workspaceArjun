/**
 * Phase 18 · MIS-206 — document permission and retrieval (the testable slice).
 *
 * `MisDocument` has no version column and `documents.ts` has no rename/update function at all
 * (confirmed against `prisma/schema.prisma` — no `version`/`supersedesId`) — matches the
 * already-logged F-23 ("documents are name+link only"), re-confirmed, not a new discovery.
 * "Versioning" and "retrieval after rename" are therefore not testable; permission gating is.
 *
 * Also covers F-23(9): `filePath` is withheld from the audit payload (see `auditSafeDocument`)
 * — a pasted link can carry a signed URL's token, and the audit table is Admin-readable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a loosely-typed fake-db row, same convention as qc-aql-decisions.test.ts
type Row = Record<string, any>;
const state: { docs: Row[] } = { docs: [] };
let seq = 0;

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
const logAuditEvent = vi.fn();
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: (...a: unknown[]) => logAuditEvent(...a) }));

const db = {
  misDocument: {
    findMany: async ({ where }: Row) => state.docs.filter((d) => d.orderId === where.orderId),
    findUnique: async ({ where }: Row) => state.docs.find((d) => d.id === where.id) ?? null,
    create: async ({ data }: Row) => { const row = { id: `doc-${++seq}`, createdAt: new Date(), ...data }; state.docs.push(row); return row; },
    delete: async ({ where }: Row) => { const i = state.docs.findIndex((d) => d.id === where.id); const [row] = state.docs.splice(i, 1); return row; },
  },
  userProfile: { findMany: async () => [] },
};
vi.mock('@/server/db', () => ({ get db() { return db; } }));

const { listDocuments, addDocument, deleteDocument } = await import('./documents');

beforeEach(() => {
  seq = 0;
  state.docs = [];
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1', authId: 'auth-1' });
  getMisRole.mockResolvedValue('OWNER');
});

describe('permission gating (MIS-206)', () => {
  it('listDocuments needs orders.read — STORE_GUY (no orders.read) is refused', async () => {
    getMisRole.mockResolvedValue('STORE_GUY');
    await expect(listDocuments('ord-1')).rejects.toThrow();
  });

  it('QC (holds orders.read) may list documents', async () => {
    getMisRole.mockResolvedValue('QC');
    await expect(listDocuments('ord-1')).resolves.toEqual([]);
  });

  it('addDocument/deleteDocument need orders.write — QC (orders.read only) is refused both', async () => {
    getMisRole.mockResolvedValue('QC');
    await expect(addDocument('ord-1', { name: 'Spec.pdf', filePath: '/f/1' })).rejects.toThrow();
    await expect(deleteDocument('doc-1')).rejects.toThrow();
  });

  it('a role holding orders.write can add and then delete a document', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    const doc = await addDocument('ord-1', { name: 'Spec.pdf', filePath: '/f/1' });
    expect(await listDocuments('ord-1')).toHaveLength(1);
    await deleteDocument(doc.id);
    expect(await listDocuments('ord-1')).toHaveLength(0);
  });

  it('a document records the uploader by their auth id, not their profile id (the two are different UUIDs)', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    const doc = await addDocument('ord-1', { name: 'Spec.pdf', filePath: '/f/1' });
    expect(doc.uploadedBy).toBe('auth-1');
    expect(doc.uploadedBy).not.toBe('u1');
  });
});

describe('F-23(9) — filePath never reaches an audit payload', () => {
  // A pasted link can carry a signed URL's token, and the audit table is readable by Admin
  // (settings.read) for any entity a non-owner may read back — so a document link must never be
  // one of the values an audit diff carries, the same discipline D24 holds for money fields.
  it('addDocument audits the row WITHOUT filePath, even though the created row itself has one', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    const doc = await addDocument('ord-1', { name: 'Spec.pdf', filePath: 'https://signed.example/f/1?token=secret' });
    expect(doc.filePath).toBe('https://signed.example/f/1?token=secret'); // the real row still has it

    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    const [entry] = logAuditEvent.mock.calls[0];
    expect(entry.action).toBe('ADD_DOCUMENT');
    expect(entry.after).not.toHaveProperty('filePath');
    expect(JSON.stringify(entry.after)).not.toContain('signed.example');
    // The rest of the row is still there — only the link is withheld.
    expect(entry.after).toMatchObject({ id: doc.id, orderId: 'ord-1', name: 'Spec.pdf' });
  });

  it('deleteDocument audits the deleted row WITHOUT filePath', async () => {
    getMisRole.mockResolvedValue('ADMIN');
    const doc = await addDocument('ord-1', { name: 'Spec.pdf', filePath: 'https://signed.example/f/1?token=secret' });
    logAuditEvent.mockClear();

    await deleteDocument(doc.id);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    const [entry] = logAuditEvent.mock.calls[0];
    expect(entry.action).toBe('DELETE_DOCUMENT');
    expect(entry.before).not.toHaveProperty('filePath');
    expect(JSON.stringify(entry.before)).not.toContain('signed.example');
  });
});
