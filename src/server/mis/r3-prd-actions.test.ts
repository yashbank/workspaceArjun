/** R3-PRD B127: every export of the production, sign-off and queue actions returns an ActionResult. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const boom = async () => { throw new Error('refused: reason'); };
vi.mock('@/server/mis/production', () => ({
  submitProductionLog: boom, getProductionFormContext: boom, editProductionLog: boom,
}));
vi.mock('@/server/mis/line-clearance', () => ({ clearLine: boom, listClearanceHistory: boom }));
vi.mock('@/server/mis/job-phases', () => ({
  signOffPhase: boom, startPhase: boom, setWasteReason: boom, acknowledgeQcFailure: boom,
}));
vi.mock('@/server/mis/idempotency', () => ({ discardParkedWrite: boom }));
vi.mock('@/server/mis/queue-resolve', () => ({ resolveParkedWrite: boom }));

const refused = { ok: false, detail: 'refused: reason' };

describe('production/actions.ts', () => {
  it('every ActionResult export returns ok:false with the detail instead of throwing', async () => {
    const a = await import('@/app/(mis)/mis/production/actions');
    expect(await a.clearLineAction({ machineId: 'm' })).toEqual(refused);
    expect(await a.getClearanceHistoryAction('m')).toEqual(refused);
    expect(await a.getProductionFormContextAction('o')).toEqual(refused);
    expect(await a.editProductionLogAction('l', {})).toEqual(refused);
  });
});

describe('production/sign-off/[phaseId]/actions.ts', () => {
  it('every export returns ok:false with the detail', async () => {
    const a = await import('@/app/(mis)/mis/production/sign-off/[phaseId]/actions');
    expect(await a.signOffPhaseAction('p', 'o')).toEqual(refused);
    expect(await a.startPhaseAction('p', 'o')).toEqual(refused);
    expect(await a.setWasteReasonAction('l', 'r', 'p')).toEqual(refused);
    expect(await a.acknowledgeQcFailureAction('c', 'n', 'p')).toEqual(refused);
  });
});

describe('queue/actions.ts', () => {
  it('both exports return ok:false with the detail', async () => {
    const a = await import('@/app/(mis)/mis/queue/actions');
    expect(await a.resolveParkedWriteAction('k', 'note')).toEqual(refused);
    expect(await a.discardParkedWriteAction('k', 'note')).toEqual(refused);
  });
});
