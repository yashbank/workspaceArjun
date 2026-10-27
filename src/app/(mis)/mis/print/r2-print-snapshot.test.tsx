/**
 * R2-46 follow-up — the COA and job-card print pages render an APPROVED version from its frozen
 * snapshot (stable on reprint), a legacy approved row with no snapshot live with a note, and name the
 * file after the version shown (`_Vn`).
 */
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { coaSnapshotFrom, jobCardSnapshotFrom, SnapshotUnreadableError } from '@/lib/mis/document-snapshot';

const getOrder = vi.fn();
const getQcForOrder = vi.fn();
const getView = vi.fn();
const getSnapshot = vi.fn();

vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/server/mis/guard', () => ({ requireMisAccess: async () => ({ id: 'u1' }) }));
vi.mock('@/server/mis/orders', () => ({ getOrder: () => getOrder() }));
vi.mock('@/server/mis/qc', () => ({ getQcForOrder: () => getQcForOrder() }));
vi.mock('@/server/mis/bom', () => ({ getBom: async () => null }));
vi.mock('@/server/mis/production', () => ({ getProductionSummary: async () => ({ totalProduced: 999, totalWaste: 0, entries: 9, byUnit: [{ unit: 'KG', produced: 999, waste: 0 }] }) }));
vi.mock('@/server/mis/job-phases', () => ({ getPhasesForOrder: async () => [] }));
vi.mock('@/server/mis/worker-allocation', () => ({ getCrewForOrder: async () => [] }));
vi.mock('@/server/mis/business-rules', () => ({ getFactoryTimezone: async () => 'Asia/Kolkata' }));
vi.mock('@/components/mis/print/print-button', () => ({ PrintButton: () => null }));
vi.mock('@/server/mis/document-versions', () => ({
  getDocumentVersionView: (...a: unknown[]) => getView(...a),
  getDocumentVersionSnapshot: (...a: unknown[]) => getSnapshot(...a),
}));
vi.mock('@/components/mis/print/document-version-bar', () => ({ DocumentVersionBar: () => null }));

const { default: CoaPage } = await import('./coa/[id]/page');
const { default: JobCardPage } = await import('./job-card/[id]/page');
const ID = '3f2b8c1e-9a4d-4e6b-8c7a-1d5e0f9a2b34';

function text(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (isValidElement(node)) return text((node.props as { children?: ReactNode }).children);
  return '';
}
/** The version strip element's props, found in the tree the page returned. */
function findBar(node: ReactNode): Record<string, unknown> | null {
  if (Array.isArray(node)) return node.map(findBar).find(Boolean) ?? null;
  if (!isValidElement(node)) return null;
  const props = node.props as Record<string, unknown> & { children?: ReactNode };
  if ('view' in props && 'fileName' in props) return props;
  return findBar(props.children);
}

const row = (over: Record<string, unknown>) => ({
  id: 'v1', version: 1, status: 'APPROVED', preparedByName: 'Q', preparedAt: '2026-10-19T04:30:00Z', approvedByName: 'Owner',
  approvedAt: '2026-10-19T06:00:00Z', notes: null, canApprove: false, hasSnapshot: true, ...over,
});
const view = (versions: ReturnType<typeof row>[]) => ({ docType: 'COA', refId: ID, versions, latest: versions[0] ?? null, canPrepare: false, canUpdateToLatest: true });

const frozenOrder = { orderNumber: 'ORD-7', status: 'COMPLETED', description: 'Frozen spec', deliveryDate: null, notes: null, customer: { name: 'Acme' } };
const frozenCoa = coaSnapshotFrom(
  frozenOrder,
  [{ id: 'c1', parameterName: 'Shade', result: 'PASS', defectType: null, notes: null, checkTime: '2026-10-19T04:00:00Z', checkBy: { name: 'Q One' } }],
  new Date('2026-10-19T06:00:00Z'),
);

beforeEach(() => {
  vi.clearAllMocks();
  // Live data has moved on since the approval.
  getOrder.mockResolvedValue({ id: ID, orderNumber: 'ORD-7', status: 'DELIVERED', description: 'Live spec CHANGED', deliveryDate: null, notes: null, customer: { name: 'Acme' } });
  getQcForOrder.mockResolvedValue([
    { id: 'c9', parameterName: 'Tear', result: 'FAIL', defectType: 'TEAR', notes: 'new', checkTime: new Date('2026-10-20T04:00:00Z'), checkBy: { name: 'Late Checker' } },
  ]);
  getSnapshot.mockResolvedValue(frozenCoa);
});

describe('COA print — approved version', () => {
  it('prints the frozen snapshot, not the changed live data, dated when it was frozen; file name _V1', async () => {
    getView.mockResolvedValue(view([row({})]));
    const tree = await CoaPage({ params: Promise.resolve({ id: ID }) });
    const t = text(tree);
    expect(getSnapshot).toHaveBeenCalledWith('COA', ID, 'v1');
    expect(t).toContain('Frozen spec');
    expect(t).toContain('Q One');
    expect(t).toContain('19/10/2026');
    expect(t).not.toContain('Live spec CHANGED');
    expect(t).not.toContain('Late Checker');
    expect(findBar(tree)).toMatchObject({ dataSource: 'SNAPSHOT', fileName: 'COA_ORD-7_191026_V1' });
  });

  it('a reprint is identical even after the live data changes again', async () => {
    getView.mockResolvedValue(view([row({})]));
    const first = text(await CoaPage({ params: Promise.resolve({ id: ID }) }));
    getQcForOrder.mockResolvedValue([]);
    getOrder.mockResolvedValue({ id: ID, orderNumber: 'ORD-7', status: 'CANCELLED', description: 'Again', deliveryDate: null, notes: null, customer: null });
    expect(text(await CoaPage({ params: Promise.resolve({ id: ID }) }))).toBe(first);
  });

  it('a legacy approved row with no snapshot prints live and says so', async () => {
    getView.mockResolvedValue(view([row({ hasSnapshot: false })]));
    const tree = await CoaPage({ params: Promise.resolve({ id: ID }) });
    expect(getSnapshot).not.toHaveBeenCalled();
    expect(text(tree)).toContain('Live spec CHANGED');
    expect(findBar(tree)).toMatchObject({ dataSource: 'LIVE_NO_SNAPSHOT', fileName: 'COA_ORD-7_191026_V1' });
  });

  it('?v=1 shows the older approved version while V2 is pending; the file name follows the shown version', async () => {
    getView.mockResolvedValue(view([row({ id: 'v2', version: 2, status: 'PREPARED', hasSnapshot: true, preparedAt: '2026-10-20T04:30:00Z' }), row({})]));
    const old = await CoaPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({ v: '1' }) });
    expect(text(old)).toContain('Frozen spec');
    expect(findBar(old)).toMatchObject({ dataSource: 'SNAPSHOT', fileName: 'COA_ORD-7_191026_V1', selected: expect.objectContaining({ id: 'v1' }) });
    // Default (newest) = V2 PREPARED: live, not frozen.
    const latest = await CoaPage({ params: Promise.resolve({ id: ID }) });
    expect(text(latest)).toContain('Live spec CHANGED');
    expect(findBar(latest)).toMatchObject({ dataSource: 'LIVE', fileName: 'COA_ORD-7_201026_V2' });
    // A junk or unknown ?v falls back to the newest.
    expect(findBar(await CoaPage({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve({ v: '99' }) }))).toMatchObject({ fileName: 'COA_ORD-7_201026_V2' });
  });

  // R2-160 (replaces "reaches error.tsx"): the corrupt copy is never printed, but the page no longer crashes.
  it('R2-160: a snapshot that cannot be read shows an inline non-printable alert with a live-data link, and no document body', async () => {
    getView.mockResolvedValue(view([row({})]));
    getSnapshot.mockRejectedValue(new SnapshotUnreadableError());
    const tree = await CoaPage({ params: Promise.resolve({ id: ID }) });
    const t = text(tree);
    expect(t).toContain("This version's saved copy can't be loaded");
    expect(t).toContain('View live data');
    expect(t).not.toContain('Certificate of Analysis');
    expect(t).not.toContain('Frozen spec');
    expect(JSON.stringify(tree)).toContain('no-print');
    expect(JSON.stringify(tree)).toContain(`/mis/orders/${ID}`);
  });
  it('R2-160: any other failure still reaches error.tsx', async () => {
    getView.mockResolvedValue(view([row({})]));
    getSnapshot.mockRejectedValue(new Error('db down'));
    await expect(CoaPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow('db down');
  });
});

describe('job-card print — approved version', () => {
  it('prints the frozen production totals and phases, not live; file name JobCard_…_V3', async () => {
    const frozen = jobCardSnapshotFrom(
      {
        order: frozenOrder,
        bom: null,
        production: { totalProduced: 120, totalWaste: 2, entries: 4, byUnit: [{ unit: 'PIECE', produced: 120, waste: 2 }] },
        phases: [{ id: 'p1', sequence: 1, status: 'SIGNED_OFF', process: { name: 'Printing' }, inCharge: { name: 'Ravi' }, startedAt: null, signedOffAt: '2026-10-19T05:00:00Z' }],
        crew: [],
      },
      new Date('2026-10-19T06:00:00Z'),
    );
    getSnapshot.mockResolvedValue(frozen);
    getView.mockResolvedValue({ ...view([row({ id: 'v3', version: 3 })]), docType: 'JOB_CARD' });
    const tree = await JobCardPage({ params: Promise.resolve({ id: ID }) });
    const t = text(tree);
    expect(getSnapshot).toHaveBeenCalledWith('JOB_CARD', ID, 'v3');
    expect(t).toMatch(/Total Produced 120\s+PIECE/);
    expect(t).toContain('Ravi');
    expect(t).toContain('Frozen spec');
    expect(t).not.toContain('999');
    expect(findBar(tree)).toMatchObject({ dataSource: 'SNAPSHOT', fileName: 'JobCard_ORD-7_191026_V3' });
  });

  it('R2-160: an unreadable snapshot shows the inline alert instead of crashing the job card', async () => {
    getSnapshot.mockRejectedValue(new SnapshotUnreadableError());
    getView.mockResolvedValue({ ...view([row({ id: 'v3', version: 3 })]), docType: 'JOB_CARD' });
    const t = text(await JobCardPage({ params: Promise.resolve({ id: ID }) }));
    expect(t).toContain("This version's saved copy can't be loaded");
    expect(t).toContain('View live data');
    expect(t).not.toContain('Total Produced');
  });
});
