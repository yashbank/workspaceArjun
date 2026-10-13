/**
 * R3-QCR B82: every export of qc/actions.ts returns an ActionResult (a refusal is data, not a thrown error).
 * One test per action.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const addQcCheck = vi.fn();
const editQcCheck = vi.fn();
const recordAqlSample = vi.fn();
const recordChecklistCheck = vi.fn();
vi.mock('@/server/mis/qc', () => ({
  addQcCheck: (...a: unknown[]) => addQcCheck(...a),
  editQcCheck: (...a: unknown[]) => editQcCheck(...a),
  recordAqlSample: (...a: unknown[]) => recordAqlSample(...a),
}));
vi.mock('@/server/mis/qc-template', () => ({ recordChecklistCheck: (...a: unknown[]) => recordChecklistCheck(...a) }));

const actions = await import('./actions');

beforeEach(() => vi.clearAllMocks());

describe('qc/actions.ts returns ActionResult', () => {
  it('addQcCheckAction: a refusal is { ok: false, detail }', async () => {
    addQcCheck.mockRejectedValue(new Error('Order not found'));
    expect(await actions.addQcCheckAction({ orderId: 'o', result: 'PASS' })).toEqual({ ok: false, detail: 'Order not found' });
    addQcCheck.mockResolvedValue({ id: 'c' });
    expect(await actions.addQcCheckAction({ orderId: 'o', result: 'PASS' })).toMatchObject({ ok: true });
  });

  it('recordAqlSampleAction: a refusal is data; success carries the AQL result', async () => {
    recordAqlSample.mockRejectedValue(new Error('Sample too small: inspect at least 32'));
    expect(await actions.recordAqlSampleAction({ orderId: 'o', sampleSize: 3, defects: [] })).toEqual({ ok: false, detail: 'Sample too small: inspect at least 32' });
    recordAqlSample.mockResolvedValue({ result: { decision: 'ACCEPT' } });
    expect(await actions.recordAqlSampleAction({ orderId: 'o', sampleSize: 32, defects: [] })).toEqual({ ok: true, value: { decision: 'ACCEPT' } });
  });

  it('editQcCheckAction: a refusal is data', async () => {
    editQcCheck.mockRejectedValue(new Error('This check can no longer be edited (24 h / acknowledged / order closed)'));
    expect(await actions.editQcCheckAction('c', { notes: 'x' })).toMatchObject({ ok: false });
    editQcCheck.mockResolvedValue({ orderId: 'o' });
    expect(await actions.editQcCheckAction('c', { notes: 'xyz' })).toMatchObject({ ok: true });
  });

  it('recordChecklistCheckAction: a refusal is data', async () => {
    recordChecklistCheck.mockRejectedValue(new Error('That checklist form is no longer active.'));
    expect(await actions.recordChecklistCheckAction({ orderId: 'o', templateId: 't', parameterName: 'p', slotTime: '09:15', status: 'PASS' })).toEqual({ ok: false, detail: 'That checklist form is no longer active.' });
  });

  it('a permission refusal is still thrown so the (mis) boundary owns it', async () => {
    addQcCheck.mockRejectedValue(Object.assign(new Error('forbidden'), { digest: 'MIS_FORBIDDEN' }));
    await expect(actions.addQcCheckAction({ orderId: 'o', result: 'PASS' })).rejects.toMatchObject({ digest: 'MIS_FORBIDDEN' });
  });

  it('every export of the module is covered above', () => {
    expect(Object.keys(actions).sort()).toEqual(['addQcCheckAction', 'editQcCheckAction', 'recordAqlSampleAction', 'recordChecklistCheckAction']);
  });
});
