/** R2-46 follow-up — "Update to latest", the snapshot note and the version list on the version strip. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prepare = vi.fn();
const approve = vi.fn();
const update = vi.fn();
vi.mock('@/app/(mis)/mis/print/document-version-actions', () => ({
  prepareDocumentVersionAction: (...a: unknown[]) => prepare(...a),
  approveDocumentVersionAction: (...a: unknown[]) => approve(...a),
  updateDocumentVersionToLatestAction: (...a: unknown[]) => update(...a),
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { DocumentVersionBar } = await import('./document-version-bar');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'v1', version: 1, status: 'APPROVED' as 'APPROVED' | 'PREPARED', preparedByName: 'Q', preparedAt: '2026-10-19T04:30:00Z',
  approvedByName: 'Owner', approvedAt: '2026-10-19T06:00:00Z', notes: null, canApprove: false, hasSnapshot: true, ...over,
});
const view = (versions: ReturnType<typeof row>[], extra: Record<string, unknown> = {}) => ({
  docType: 'COA' as const, refId: 'o1', versions, latest: versions[0] ?? null, canPrepare: true, canUpdateToLatest: false, ...extra,
});

beforeEach(() => {
  update.mockReset().mockResolvedValue({ ok: true, value: { id: 'v2', version: 2 } });
  refresh.mockClear();
});

describe('DocumentVersionBar — snapshots', () => {
  it('an Admin/Owner on an approved version gets "Update to latest (V2)" in place of Issue; it calls the action with the version id', async () => {
    render(<DocumentVersionBar view={view([row()], { canUpdateToLatest: true })} fileName="COA_ORD-1_191026_V1" dataSource="SNAPSHOT" />);
    expect(screen.queryByRole('button', { name: /Issue/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Update to latest (V2)' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('v1'));
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByTestId('doc-source').textContent).toContain('Frozen copy');
  });

  it('without the right (server says no) there is no Update button', () => {
    render(<DocumentVersionBar view={view([row()])} fileName="COA_ORD-1_191026_V1" dataSource="SNAPSHOT" />);
    expect(screen.queryByRole('button', { name: /Update to latest/ })).toBeNull();
  });

  it('a refusal from Update to latest shows inline', async () => {
    update.mockResolvedValue({ ok: false, detail: 'V2 is already issued — open it instead.' });
    render(<DocumentVersionBar view={view([row()], { canUpdateToLatest: true })} fileName="COA_ORD-1_191026_V1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Update to latest (V2)' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already issued');
  });

  it('a legacy approved version shows the "no snapshot" note', () => {
    render(<DocumentVersionBar view={view([row({ hasSnapshot: false })])} fileName="COA_ORD-1_191026_V1" dataSource="LIVE_NO_SNAPSHOT" />);
    expect(screen.getByTestId('doc-source').textContent).toMatch(/No snapshot/);
  });

  it('viewing an older version: the strip names it and links every version (?v=N)', () => {
    const versions = [row({ id: 'v2', version: 2, status: 'PREPARED', approvedByName: null }), row()];
    render(<DocumentVersionBar view={view(versions)} selected={versions[1]} fileName="COA_ORD-1_191026_V1" dataSource="SNAPSHOT" />);
    expect(screen.getByTestId('doc-version').textContent).toContain('V1 · Approved by Owner');
    expect(screen.getByTestId('doc-version').textContent).toContain('older version (V2 is the newest)');
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['?v=2', '?v=1']);
    expect(links[1].getAttribute('aria-current')).toBe('page');
  });
});
