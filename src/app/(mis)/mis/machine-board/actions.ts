'use server';
import { allocateMachine, releaseMachine } from '@/server/mis/machines-board';
import { revalidatePath } from 'next/cache';

export async function allocateMachineAction(data: { machineId: string; orderId?: string; jobRef?: string; startsAt: Date; endsAt: Date; notes?: string }) {
  await allocateMachine(data);
  revalidatePath('/mis/machine-board');
}
export async function releaseMachineAction(allocationId: string) {
  await releaseMachine(allocationId);
  revalidatePath('/mis/machine-board');
}
