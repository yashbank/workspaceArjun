'use server';

import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import {
  acknowledgeQcFailure,
  setWasteReason,
  signOffPhase,
  startPhase,
} from '@/server/mis/job-phases';

/**
 * Sign-off takes no timestamp argument, here or anywhere (MIS-163). The server
 * stamps it; a client clock never reaches the record.
 *
 * R3 B127: every export returns an `ActionResult`; the screen shows `detail` on a refusal.
 */
export async function signOffPhaseAction(phaseId: string, orderId: string, notes?: string, reason?: string) {
  return asResult(async () => {
    // R2-295 handover note; R2-330 Admin/Owner reason when signing on the in-charge's behalf.
    await signOffPhase(phaseId, { notes: notes?.trim() || undefined, reason: reason?.trim() || undefined });
    revalidatePath(`/mis/production/sign-off/${phaseId}`);
    revalidatePath(`/mis/orders/${orderId}`);
    revalidatePath('/mis');
  });
}

export async function startPhaseAction(phaseId: string, orderId: string) {
  return asResult(async () => {
    await startPhase(phaseId);
    revalidatePath(`/mis/orders/${orderId}`);
    revalidatePath('/mis');
  });
}

export async function setWasteReasonAction(productionLogId: string, reason: string, phaseId: string) {
  return asResult(async () => {
    await setWasteReason(productionLogId, reason);
    revalidatePath(`/mis/production/sign-off/${phaseId}`);
  });
}

export async function acknowledgeQcFailureAction(checkId: string, note: string, phaseId: string) {
  return asResult(async () => {
    const rec = await acknowledgeQcFailure(checkId, note);
    if (phaseId) revalidatePath(`/mis/production/sign-off/${phaseId}`);
    if (rec?.orderId) revalidatePath(`/mis/qc/${rec.orderId}`); // R2-311
  });
}
