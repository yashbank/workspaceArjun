'use server';
import { isActiveStatus, getPhasesForOrder } from '@/server/mis/job-phases';
import { allocateMachine, releaseMachine } from '@/server/mis/machines-board';
import { revalidatePath } from 'next/cache';

export async function allocateMachineAction(data: { machineId: string; orderId?: string; jobPhaseId?: string; startsAt: Date; endsAt: Date; notes?: string }) {
  await allocateMachine(data);
  revalidatePath('/mis/machine-board');
}
export async function releaseMachineAction(allocationId: string) {
  await releaseMachine(allocationId);
  revalidatePath('/mis/machine-board');
}

/**
 * 22.1 — the order/phase picker `machine-board-screen.tsx` never had (only `jobRef` free text
 * did). Open phases only: a booking against a closed or not-yet-started phase is not what the
 * picker is for, and `allocateMachine` itself refuses an inactive phase either way — this just
 * keeps the dropdown from offering a choice the server would reject.
 */
export async function getOpenPhasesForOrderAction(orderId: string) {
  const phases = await getPhasesForOrder(orderId);
  return phases
    .filter((p) => isActiveStatus(p.status))
    .map((p) => ({ id: p.id, sequence: p.sequence, processName: p.process.name }));
}
