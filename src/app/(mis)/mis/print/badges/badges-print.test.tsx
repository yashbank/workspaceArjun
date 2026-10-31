/**
 * Bulk badge print (`/mis/print/badges`) — one printable sheet of every active employee's QR
 * badge, built on the same `listEmployeeRoster` the gate tablet pulls from, so it carries the
 * same `employees.read` gate as the per-row Badge link on the Employees screen.
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.fn();
vi.mock('@/server/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));

const getMisRole = vi.fn();
vi.mock('@/server/mis/roles', () => ({ getMisRole: (...a: unknown[]) => getMisRole(...a) }));

const requireMisAccess = vi.fn(async () => ({ id: 'u1' }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: () => requireMisAccess() }));

const mockFindMany = vi.fn();
vi.mock('@/server/db', () => ({
  db: {
    misEmployee: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
    },
  },
}));

vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));

const qrToString = vi.fn(async (text: string, _options?: unknown) => `<svg data-qr="${text}"></svg>`);
vi.mock('qrcode', () => ({ default: { toString: (text: string, options?: unknown) => qrToString(text, options) } }));

// `listEmployeeRoster` itself is NOT mocked — this exercises its real `employees.read` gate
// and its real `deletedAt: null` filter; only `isActive` filtering is the new page's own job.
const { default: BulkBadgesPage } = await import('./page');

const ROSTER = [
  { id: 'e1', employeeCode: 'W001', name: 'Active Worker', nameHi: null, role: 'WORKER', isActive: true, deletedAt: null, userProfile: null },
  { id: 'e2', employeeCode: 'W002', name: 'Inactive Worker', nameHi: null, role: 'WORKER', isActive: false, deletedAt: null, userProfile: null },
  { id: 'e3', employeeCode: 'W003', name: 'Deleted Worker', nameHi: null, role: 'WORKER', isActive: true, deletedAt: new Date('2026-01-01'), userProfile: null },
];

function text(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (isValidElement(node)) return text((node.props as { children?: ReactNode }).children);
  return '';
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'u1' });
  getMisRole.mockResolvedValue('OWNER');
  qrToString.mockImplementation(async (t: string) => `<svg data-qr="${t}"></svg>`);
  // The real listEmployeeRoster queries `{ where: { deletedAt: null } }` — honour that here so
  // a soft-deleted row is excluded exactly the way the live database would exclude it.
  mockFindMany.mockImplementation(async ({ where }: { where: { deletedAt: null | undefined } }) =>
    ROSTER.filter((r) => (where?.deletedAt === null ? r.deletedAt === null : true)),
  );
});

describe('/mis/print/badges', () => {
  it('only active employees appear — not an inactive one, not a deleted one', async () => {
    const tree = await BulkBadgesPage();
    const t = text(tree);
    expect(t).toContain('Active Worker');
    expect(t).not.toContain('Inactive Worker');
    expect(t).not.toContain('Deleted Worker');
  });

  it('the QR encodes the plain employeeCode exactly — never JSON, never a URL', async () => {
    await BulkBadgesPage();
    expect(qrToString).toHaveBeenCalledTimes(1);
    expect(qrToString).toHaveBeenCalledWith('W001', { type: 'svg', margin: 0 });
  });

  it('a role without employees.read is refused, not handed an empty page', async () => {
    getMisRole.mockResolvedValue('QC'); // QC holds no employees.read grant
    await expect(BulkBadgesPage()).rejects.toThrow(/Not permitted/);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('no active employees reads as an empty state, not a crash', async () => {
    mockFindMany.mockResolvedValue([]);
    const tree = await BulkBadgesPage();
    expect(text(tree)).toContain('No active employees to badge.');
  });
});
