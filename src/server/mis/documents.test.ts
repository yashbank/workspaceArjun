/**
 * Phase 18 · MIS-206 — document permission and retrieval (the testable slice).
 *
 * `MisDocument` has no version column and `documents.ts` has no rename/update function at all
 * (confirmed against `prisma/schema.prisma` — no `version`/`supersedesId`) — matches the
 * already-logged F-23 ("documents are name+link only"), re-confirmed, not a new discovery.
 * "Versioning" and "retrieval after rename" are therefore not testable; permission gating is.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const state: { docs: Row[] } = { docs: [] };
let seq = 0;

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));
vi.mock('@/server/mis/audit', () => ({ logAuditEvent: vi.fn() }));

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
