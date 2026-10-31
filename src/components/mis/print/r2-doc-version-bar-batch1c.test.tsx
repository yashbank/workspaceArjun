/** R2-156 / R2-157 / R2-158 — one pending version, newest-only approve, discard a draft. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const prepare = vi.fn();
const approve = vi.fn();
const voidIt = vi.fn();
vi.mock('@/app/(mis)/mis/print/document-version-actions', () => ({
  prepareDocumentVersionAction: (...a: unknown[]) => prepare(...a),
  approveDocumentVersionAction: (...a: unknown[]) => approve(...a),
  updateDocumentVersionToLatestAction: vi.fn(),
  voidDocumentVersionAction: (...a: unknown[]) => voidIt(...a),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { DocumentVersionBar } = await import('./document-version-bar');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'v1', version: 1, status: 'PREPARED' as 'PREPARED' | 'APPROVED' | 'VOID', preparedByName: 'Q', preparedAt: '2026-10-19T04:30:00Z',
  approvedByName: null, approvedAt: null, notes: null, canApprove: false, canVoid: false, ...over,
});
const view = (versions: ReturnType<typeof row>[], canPrepare = true) => ({
  docType: 'COA' as const, refId: 'o1', versions, latest: versions.find((v) => v.status !== 'VOID') ?? null, canPrepare,
});

beforeEach(() => {
  prepare.mockReset().mockResolvedValue({ ok: true });
  approve.mockReset().mockResolvedValue({ ok: true });
  voidIt.mockReset().mockResolvedValue({ ok: true });
});

describe('R2-156 — no Issue V(n+1) while the newest version is PREPARED', () => {
  it('hides Issue when the newest is PREPARED, shows it when newest is APPROVED', () => {
    const { unmount } = render(<DocumentVersionBar view={view([row()])} fileName="f" />);
    expect(screen.queryByRole('button', { name: /^Issue V/ })).toBeNull();
    unmount();
    render(<DocumentVersionBar view={view([row({ status: 'APPROVED' })])} fileName="f" />);
    expect(screen.getByRole('button', { name: 'Issue V2' })).toBeTruthy();
  });
  it('after the only version is discarded, Issue offers the next number (the voided number is not reused)', () => {
    render(<DocumentVersionBar view={view([row({ status: 'VOID' })])} fileName="f" />);
    expect(screen.getByRole('button', { name: 'Issue V2' })).toBeTruthy();
  });
});

describe('R2-157 — Approve only on the newest version', () => {
  it('renders one Approve button, for the newest, even if an older row says canApprove', () => {
    render(<DocumentVersionBar view={view([row({ id: 'v2', version: 2, canApprove: true }), row({ canApprove: true })])} fileName="f" />);
    expect(screen.getAllByRole('button', { name: /^Approve V/ }).map((b) => b.textContent)).toEqual(['Approve V2']);
  });
});

describe('R2-158 — discard a draft', () => {
  it('shows Discard only where the server allows, asks for a reason, and sends it', async () => {
    const { unmount } = render(<DocumentVersionBar view={view([row()])} fileName="f" />);
    expect(screen.queryByRole('button', { name: /Discard/ })).toBeNull();
    unmount();
    render(<DocumentVersionBar view={view([row({ canVoid: true })])} fileName="f" />);
    fireEvent.click(screen.getByRole('button', { name: 'Discard V1' }));
    fireEvent.change(screen.getByLabelText('Reason for discarding'), { target: { value: 'issued by mistake' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm discard' }));
    await waitFor(() => expect(voidIt).toHaveBeenCalledWith('v1', 'issued by mistake'));
  });
  it('a discarded version is labelled Discarded in the history and nav', () => {
    render(<DocumentVersionBar view={view([row({ id: 'v2', version: 2, status: 'VOID' }), row({ status: 'APPROVED' })])} fileName="f" />);
    expect(screen.getByText(/V2 discarded/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'V2 · Discarded' })).toBeTruthy();
  });
});
