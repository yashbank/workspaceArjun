'use server';

import { revalidatePath } from 'next/cache';

import {
  acknowledgeQcFailure,
  setWasteReason,
  signOffPhase,
  startPhase,
} from '@/server/mis/job-phases';

/**
 * Sign-off takes no timestamp argument, here or anywhere (MIS-163). The server
 * stamps it; a client clock never reaches the record.
 */
export async function signOffPhaseAction(phaseId: string, orderId: string) {
  await signOffPhase(phaseId);
  revalidatePath(`/mis/production/sign-off/${phaseId}`);
  revalidatePath(`/mis/orders/${orderId}`);
  revalidatePath('/mis');
}

export async function startPhaseAction(phaseId: string, orderId: string) {
  await startPhase(phaseId);
  revalidatePath(`/mis/orders/${orderId}`);
  revalidatePath('/mis');
}

export async function setWasteReasonAction(productionLogId: string, reason: string, phaseId: string) {
  await setWasteReason(productionLogId, reason);
  revalidatePath(`/mis/production/sign-off/${phaseId}`);
}

export async function acknowledgeQcFailureAction(checkId: string, note: string, phaseId: string) {
  await acknowledgeQcFailure(checkId, note);
  revalidatePath(`/mis/production/sign-off/${phaseId}`);
}
