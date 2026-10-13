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
export async function signOffPhaseAction(phaseId: string, orderId: string) {
  const result = await asResult(async () => {
    await signOffPhase(phaseId);
  });
  if (result.ok) {
    revalidatePath(`/mis/production/sign-off/${phaseId}`);
    revalidatePath(`/mis/orders/${orderId}`);
    revalidatePath('/mis');
  }
  return result;
}

export async function startPhaseAction(phaseId: string, orderId: string) {
  const result = await asResult(async () => {
    await startPhase(phaseId);
  });
  if (result.ok) {
    revalidatePath(`/mis/orders/${orderId}`);
    revalidatePath('/mis');
  }
  return result;
}

export async function setWasteReasonAction(productionLogId: string, reason: string, phaseId: string) {
  const result = await asResult(async () => {
    await setWasteReason(productionLogId, reason);
  });
  if (result.ok) revalidatePath(`/mis/production/sign-off/${phaseId}`);
  return result;
}

export async function acknowledgeQcFailureAction(checkId: string, note: string, phaseId: string) {
  const result = await asResult(async () => {
    await acknowledgeQcFailure(checkId, note);
  });
  if (result.ok) revalidatePath(`/mis/production/sign-off/${phaseId}`);
  return result;
}
