/**
 * R3-QCR B72 (UI: blank sample is a client error), B79 (pass rate ignores N/A), B82 (inline refusal), B84 (Edit action).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const addQcCheckAction = vi.fn();
const recordAqlSampleAction = vi.fn();
const editQcCheckAction = vi.fn();
vi.mock('@/app/(mis)/mis/qc/actions', () => ({
  addQcCheckAction: (...a: unknown[]) => addQcCheckAction(...a),
  recordAqlSampleAction: (...a: unknown[]) => recordAqlSampleAction(...a),
  editQcCheckAction: (...a: unknown[]) => editQcCheckAction(...a),
  recordChecklistCheckAction: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { QcDetailScreen } = await import('./qc-detail-screen');

const check = (id: string, result: string, editable = false) => ({ id, checkTime: new Date('2026-09-05T04:30:00Z'), result, parameterName: 'Shade', defectType: null, defectQty: null, notes: 'n', editable });
const props = (over: Record<string, unknown> = {}) => ({
  order: { id: 'o1', orderNumber: 'ORD-118', status: 'IN_PRODUCTION', customer: { name: 'Acme' } },
  checks: [check('c1', 'PASS', true), check('c2', 'FAIL', false)],
  summary: { total: 10, pass: 8, fail: 0, na: 2, totalDefectQty: 0 },
  canWrite: true,
  defectTypes: [],
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('B79 pass rate', () => {
  it('8 pass + 2 N/A is 100% (N/A excluded) and N/A is shown on its own', () => {
    render(<QcDetailScreen {...props()} />);
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    expect(screen.getByText('N/A: 2')).toBeTruthy();
  });

  it('no pass and no fail reads a dash, not 0%', () => {
    render(<QcDetailScreen {...props({ summary: { total: 2, pass: 0, fail: 0, na: 2, totalDefectQty: 0 } })} />);
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('the defect tile is labelled "Defects (failed checks)"', () => {
    render(<QcDetailScreen {...props()} />);
    expect(screen.getByText('Defects (failed checks)')).toBeTruthy();
  });
});

describe('B72 AQL form', () => {
  it('a blank sample size shows "Enter the sample size" and calls nothing', async () => {
    render(<QcDetailScreen {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run AQL Sample' }));
    fireEvent.change(screen.getByLabelText('Sample Size'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Enter the sample size'));
    expect(recordAqlSampleAction).not.toHaveBeenCalled();
  });

  it('a server refusal shows inline', async () => {
    recordAqlSampleAction.mockResolvedValue({ ok: false, detail: 'Sample too small: inspect at least 32' });
    render(<QcDetailScreen {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Run AQL Sample' }));
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Sample too small: inspect at least 32'));
  });
});

describe('B82 add check refusal', () => {
  it('shows result.detail inline and keeps the form open', async () => {
    addQcCheckAction.mockResolvedValue({ ok: false, detail: 'A failed check needs a defect type or a note of at least 3 characters' });
    render(<QcDetailScreen {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add Check' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('A failed check needs'));
  });
});

describe('B84 Edit action', () => {
  it('shows Edit only on rows the server marked editable, and only to qc.write holders', () => {
    const { unmount } = render(<QcDetailScreen {...props()} />);
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    unmount();
    render(<QcDetailScreen {...props({ canWrite: false })} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });

  it('saving calls editQcCheckAction with the check id; a refusal shows inline', async () => {
    editQcCheckAction.mockResolvedValue({ ok: false, detail: 'This check can no longer be edited (24 h / acknowledged / order closed)' });
    render(<QcDetailScreen {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Save' }).at(-1)!);
    await waitFor(() => expect(editQcCheckAction).toHaveBeenCalledWith('c1', expect.objectContaining({ result: 'PASS' })));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('can no longer be edited'));
  });
});
