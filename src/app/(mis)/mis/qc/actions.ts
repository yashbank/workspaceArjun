'use server';
import { addQcCheck, editQcCheck, recordAqlSample, type AqlDefectLine } from '@/server/mis/qc';
import { recordChecklistCheck } from '@/server/mis/qc-template';
import { asResult } from '@/lib/mis/action-result';
import type { ChecklistStatus } from '@/lib/mis/qc-template';
import { revalidatePath } from 'next/cache';

/** R3-QCR B82: every export returns an `ActionResult`; the screens show `result.detail` inline. */
export async function addQcCheckAction(data: {
  orderId: string;
  bomStageId?: string;
  parameterName?: string;
  result: 'PASS' | 'FAIL' | 'NA';
  defectType?: string;
  defectQty?: number;
  notes?: string;
}) {
  return asResult(async () => {
    await addQcCheck(data);
    revalidatePath('/mis/qc');
    revalidatePath('/mis/qc/grid');
    revalidatePath(`/mis/qc/${data.orderId}`);
  });
}

export async function recordAqlSampleAction(data: {
  orderId: string;
  bomStageId?: string;
  sampleSize: number;
  lotSize?: number;
  defects: AqlDefectLine[];
  notes?: string;
}) {
  return asResult(async () => {
    const { result } = await recordAqlSample(data);
    revalidatePath('/mis/qc');
    revalidatePath('/mis/qc/grid'); // R2-321
    revalidatePath(`/mis/qc/${data.orderId}`);
    return result;
  });
}

/** B84 / R2-34: correct a check (Admin/Owner 7 days; QC own checks same day), with a reason. */
export async function editQcCheckAction(
  id: string,
  patch: { result?: string; defectType?: string | null; defectQty?: number | null; notes?: string | null; parameterName?: string; reason?: string },
) {
  return asResult(async () => {
    const check = await editQcCheck(id, patch);
    revalidatePath('/mis/qc');
    revalidatePath('/mis/qc/grid');
    revalidatePath(`/mis/qc/${check.orderId}`);
  });
}

/** V2 Epic 5: one tap on a checklist cell. */
export async function recordChecklistCheckAction(input: { orderId: string; templateId: string; parameterName: string; slotTime: string; status: ChecklistStatus }) {
  return asResult(async () => {
    await recordChecklistCheck(input);
    revalidatePath(`/mis/qc/${input.orderId}`);
    revalidatePath('/mis/qc');
    revalidatePath('/mis/qc/grid');
  });
}
