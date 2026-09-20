'use server';
import { approveBom } from '@/server/mis/bom';
import { approveLeave } from '@/server/mis/attendance';
import { approvePO } from '@/server/mis/po';
import { revalidatePath } from 'next/cache';

export async function approveBomAction(bomId: string) {
  await approveBom(bomId);
  revalidatePath('/mis/approvals');
}

export async function approveLeaveAction(leaveId: string, approve: boolean) {
  await approveLeave(leaveId, approve);
  revalidatePath('/mis/approvals');
}

export async function approvePOAction(poId: string) {
  await approvePO(poId);
  revalidatePath('/mis/approvals');
}
