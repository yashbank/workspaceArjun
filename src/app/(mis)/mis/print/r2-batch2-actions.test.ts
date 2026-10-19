/** R2-17/34/46: the new server actions return an ActionResult (a refusal is data); a permission refusal is still thrown. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const boom = async () => { throw new Error('refused: reason'); };
const forbidden = async () => { throw Object.assign(new Error('forbidden'), { digest: 'MIS_FORBIDDEN' }); };
const prepare = vi.fn(boom);
vi.mock('@/server/mis/document-versions', () => ({ prepareDocumentVersion: (...a: unknown[]) => (prepare as (...x: unknown[]) => unknown)(...a), approveDocumentVersion: boom }));
vi.mock('@/server/mis/production', () => ({ voidProductionLog: boom }));
vi.mock('@/server/mis/qc', () => ({ voidQcCheck: boom }));

const refused = { ok: false, detail: 'refused: reason' };

describe('R2 batch 2 actions', () => {
  it('every export returns ok:false with the detail instead of throwing', async () => {
    const docs = await import('./document-version-actions');
    expect(await docs.prepareDocumentVersionAction('COA', 'o1')).toEqual(refused);
    expect(await docs.approveDocumentVersionAction('v1')).toEqual(refused);
    const prod = await import('@/app/(mis)/mis/production/correction-actions');
    expect(await prod.voidProductionLogAction('l1', 'dup')).toEqual(refused);
    const qc = await import('@/app/(mis)/mis/qc/correction-actions');
    expect(await qc.voidQcCheckAction('c1', 'dup')).toEqual(refused);
  });
  it('a permission refusal is thrown for the (mis) boundary', async () => {
    prepare.mockImplementationOnce(forbidden);
    const docs = await import('./document-version-actions');
    await expect(docs.prepareDocumentVersionAction('COA', 'o1')).rejects.toMatchObject({ digest: 'MIS_FORBIDDEN' });
  });
});
