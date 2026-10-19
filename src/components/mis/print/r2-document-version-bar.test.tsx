/** R2-46 — the version strip on COA / job-card prints. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prepare = vi.fn();
const approve = vi.fn();
vi.mock('@/app/(mis)/mis/print/document-version-actions', () => ({
  prepareDocumentVersionAction: (...a: unknown[]) => prepare(...a),
  approveDocumentVersionAction: (...a: unknown[]) => approve(...a),
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { DocumentVersionBar } = await import('./document-version-bar');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'v1', version: 1, status: 'PREPARED' as const, preparedByName: 'Q Inspector', preparedAt: '2026-10-19T04:30:00Z',
  approvedByName: null, approvedAt: null, notes: null, canApprove: false, ...over,
});
const view = (versions: ReturnType<typeof row>[], canPrepare = false) => ({ docType: 'COA' as const, refId: 'o1', versions, latest: versions[0] ?? null, canPrepare });

beforeEach(() => {
  prepare.mockReset().mockResolvedValue({ ok: true, value: { id: 'v2', version: 2 } });
  approve.mockReset().mockResolvedValue({ ok: true, value: { id: 'v1', version: 1 } });
  refresh.mockClear();
});

describe('DocumentVersionBar', () => {
  it('an unissued document says so and offers V1 to a preparer; the page title is the file name', async () => {
    render(<DocumentVersionBar view={view([], true)} fileName="COA_ORD-1_191026_DRAFT" />);
    expect(screen.getByTestId('doc-version').textContent).toContain('Not issued — uncontrolled copy');
    fireEvent.click(screen.getByRole('button', { name: 'Issue V1' }));
    await waitFor(() => expect(prepare).toHaveBeenCalledWith('COA', 'o1'));
    expect(refresh).toHaveBeenCalled();
    expect(document.title).toBe('COA_ORD-1_191026_DRAFT');
  });

  it('a prepared version shows its status and an Approve button only where the server allows', async () => {
    const { unmount } = render(<DocumentVersionBar view={view([row()])} fileName="COA_ORD-1_191026_V1" />);
    expect(screen.getByTestId('doc-version').textContent).toContain('V1 · Prepared — awaiting approval · prepared by Q Inspector');
    expect(screen.queryByRole('button', { name: /Approve/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Issue/ })).toBeNull();
    unmount();
    render(<DocumentVersionBar view={view([row({ canApprove: true })])} fileName="COA_ORD-1_191026_V1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve V1' }));
    await waitFor(() => expect(approve).toHaveBeenCalledWith('v1'));
  });

  it('an approved reprint reads Approved by <name>; a refusal shows inline', async () => {
    prepare.mockResolvedValue({ ok: false, detail: 'Order not found.' });
    render(<DocumentVersionBar view={view([row({ version: 2, status: 'APPROVED', approvedByName: 'Owner' }), row()], true)} fileName="COA_ORD-1_191026_V2" />);
    expect(screen.getByTestId('doc-version').textContent).toContain('V2 · Approved by Owner');
    expect(screen.getByText(/History: V2 approved · V1 prepared/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Issue V3' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});
