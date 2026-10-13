'use server';

import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import {
  assignWorkers,
  copyCrew,
  moveWorker,
  releaseWorker,
  type CopyCrewSkip,
  type WorkerConflict,
} from '@/server/mis/worker-allocation';

/**
 * Every crew action returns an `ActionResult` (R3 B90): an expected refusal ("Not found or not in
 * your team", "Already released", a blocked overlap) arrives as text the screen shows, never as
 * the error boundary. A permission refusal is still thrown, by design (`asResult`).
 */

function refresh() {
  revalidatePath('/mis/crew');
  revalidatePath('/mis');
}

export type AssignWorkersActionResult = {
  createdCount: number;
  alreadyAssigned: string[];
  blocked: WorkerConflict[];
  warnings: WorkerConflict[];
};

export async function assignWorkersAction(input: {
  machineAllocationId: string;
  employeeIds: string[];
  shiftId: string;
  /** A factory date key. Omitted means the factory's today. */
  allocationDate?: string;
  jobPhaseId?: string;
  confirmWarnings?: boolean;
  override?: { reason: string };
}) {
  return asResult<AssignWorkersActionResult>(async () => {
    const result = await assignWorkers(input);
    refresh();
    return {
      createdCount: result.created.length,
      alreadyAssigned: result.alreadyAssigned,
      blocked: result.blocked,
      warnings: result.warnings,
    };
  });
}

export async function releaseWorkerAction(workerAllocationId: string) {
  return asResult(async () => {
    await releaseWorker(workerAllocationId);
    refresh();
  });
}

export async function moveWorkerAction(input: { workerAllocationId: string; toMachineAllocationId: string }) {
  return asResult(async () => {
    await moveWorker(input);
    refresh();
  });
}

export async function copyCrewAction(input: { fromDateKey: string; toDateKey: string; shiftId: string }) {
  return asResult<{ copied: number; bookings: number; skipped: CopyCrewSkip[] }>(async () => {
    const result = await copyCrew(input);
    refresh();
    return result;
  });
}
