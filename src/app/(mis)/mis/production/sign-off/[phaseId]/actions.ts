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
export async function signOffPhaseAction(phaseId: string, orderId: string, notes?: string) {
  return asResult(async () => {
    await signOffPhase(phaseId, notes?.trim() ? { notes: notes.trim() } : undefined); // R2-295
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
    await acknowledgeQcFailure(checkId, note);
    revalidatePath(`/mis/production/sign-off/${phaseId}`);
  });
}
