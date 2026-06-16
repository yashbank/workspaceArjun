import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockLogAuditEvent = vi.fn();

vi.mock('@/server/db', () => ({
  db: {
    folder: {
      findFirst: (...a: unknown[]) => mockFindFirst(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      update: (...a: unknown[]) => mockUpdate(...a),
    },
  },
}));
vi.mock('@/server/rbac', () => ({
  requirePermission: vi.fn().mockResolvedValue({ id: 'u1', role: 'owner', email: 'o@e.com' }),
}));
vi.mock('@/server/audit', () => ({ logAuditEvent: (...a: unknown[]) => mockLogAuditEvent(...a) }));

import { moveFolder } from '@/server/folders';

// Tree: ROOT → P;  ROOT → T;  P → X → C   (we move X around)
const FOLDERS: Record<string, { id: string; name: string; parentId: string | null; deletedAt: null }> = {
  P: { id: 'P', name: 'P', parentId: null, deletedAt: null },
  T: { id: 'T', name: 'T', parentId: null, deletedAt: null },
  X: { id: 'X', name: 'X', parentId: 'P', deletedAt: null },
  C: { id: 'C', name: 'C', parentId: 'X', deletedAt: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  // folder lookup ({ id, deletedAt }) and dupe-name lookup ({ name, parentId, ... }).
  mockFindFirst.mockImplementation((args: { where: { id?: string; name?: string } }) => {
    if (args.where.name !== undefined) return Promise.resolve(null); // no name dupe
    return Promise.resolve(FOLDERS[args.where.id as string] ?? null);
  });
  // cycle walk (select parentId) + folderNameOrRoot (select name).
  mockFindUnique.mockImplementation((args: { where: { id: string } }) =>
    Promise.resolve(FOLDERS[args.where.id] ?? null),
  );
  mockUpdate.mockImplementation((args: { where: { id: string }; data: { parentId: string | null } }) =>
    Promise.resolve({ ...FOLDERS[args.where.id], parentId: args.data.parentId }),
  );
});

describe('moveFolder — internal move hierarchy safety (PHASE 2)', () => {
  it('reparents only the moved folder; descendants follow by reference (no subtree rewrite)', async () => {
    await moveFolder('X', 'T'); // move X under T

    // Exactly ONE folder row changes: X's parentId → T. Descendants (C) are never
    // touched, so the subtree is preserved with no duplication or orphaning.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ where: { id: 'X' }, data: { parentId: 'T' } });

    // Audited as a move with from/to parents.
    const evt = mockLogAuditEvent.mock.calls[0][0];
    expect(evt.action).toBe('folder.move');
    expect(evt.meta).toMatchObject({ fromParent: 'P', toParent: 'T' });
  });

  it('rejects moving a folder into itself', async () => {
    await expect(moveFolder('X', 'X')).rejects.toThrow(/into itself/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects moving a folder into its own descendant (cycle)', async () => {
    // Move X into C, where C is a child of X → would create a cycle.
    await expect(moveFolder('X', 'C')).rejects.toThrow(/descendant/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('moves a folder to the root (parentId null)', async () => {
    await moveFolder('X', null);
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({ where: { id: 'X' }, data: { parentId: null } });
  });
});
