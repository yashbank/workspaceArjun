'use server';

import { revalidatePath } from 'next/cache';

import { assignWorkers, releaseWorker } from '@/server/mis/worker-allocation';

export async function assignWorkersAction(input: {
  machineAllocationId: string;
  employeeIds: string[];
  shiftId: string;
  allocationDate: string;
  jobPhaseId?: string;
  confirmOverlapFor?: string[];
}) {
  const result = await assignWorkers({
    ...input,
    allocationDate: new Date(input.allocationDate),
  });
  revalidatePath('/mis/crew');
  revalidatePath('/mis');
  return {
    createdCount: result.created.length,
    alreadyAssigned: result.alreadyAssigned,
    warnings: result.warnings,
  };
}

export async function releaseWorkerAction(workerAllocationId: string) {
  await releaseWorker(workerAllocationId);
  revalidatePath('/mis/crew');
  revalidatePath('/mis');
}
