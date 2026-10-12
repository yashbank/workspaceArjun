'use server';
import { approveBom, rejectBom } from '@/server/mis/bom';
import { asResult, type ActionResult } from '@/lib/mis/action-result';
import { approveLeave } from '@/server/mis/attendance';
import { approvePO } from '@/server/mis/po';
import { approveExtraPayDay, rejectExtraPayDay } from '@/server/mis/extra-pay-days';
import { revalidatePath } from 'next/cache';

export async function approveBomAction(bomId: string): Promise<ActionResult> {
  return asResult(async () => {
    await approveBom(bomId);
    revalidatePath('/mis/approvals');
  });
}

export async function rejectBomAction(orderId: string, reason: string): Promise<ActionResult> {
  return asResult(async () => {
    await rejectBom(orderId, reason);
    revalidatePath('/mis/approvals');
    revalidatePath('/mis/bom', 'layout');
  });
}

export async function approveLeaveAction(leaveId: string, approve: boolean) {
  await approveLeave(leaveId, approve);
  revalidatePath('/mis/approvals');
}

export async function approvePOAction(poId: string): Promise<ActionResult> {
  return asResult(async () => {
    await approvePO(poId);
    revalidatePath('/mis/approvals');
  });
}

export async function approveExtraPayDayAction(id: string) {
  await approveExtraPayDay(id);
  revalidatePath('/mis/approvals');
}

export async function rejectExtraPayDayAction(id: string) {
  await rejectExtraPayDay(id);
  revalidatePath('/mis/approvals');
}
