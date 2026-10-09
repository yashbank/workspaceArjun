'use server';
import { addQcCheck, recordAqlSample, type AqlDefectLine } from '@/server/mis/qc';
import { recordChecklistCheck } from '@/server/mis/qc-template';
import { asResult } from '@/lib/mis/action-result';
import type { ChecklistStatus } from '@/lib/mis/qc-template';
import { revalidatePath } from 'next/cache';

export async function addQcCheckAction(data: {
  orderId: string;
  bomStageId?: string;
  parameterName?: string;
  result: 'PASS' | 'FAIL' | 'NA';
  defectType?: string;
  defectQty?: number;
  notes?: string;
}) {
  await addQcCheck(data);
  revalidatePath('/mis/qc');
  revalidatePath('/mis/qc/grid');
}

export async function recordAqlSampleAction(data: {
  orderId: string;
  bomStageId?: string;
  sampleSize: number;
  defects: AqlDefectLine[];
  notes?: string;
}) {
  const { result } = await recordAqlSample(data);
  revalidatePath('/mis/qc');
  revalidatePath(`/mis/qc/${data.orderId}`);
  return result;
}

/** V2 Epic 5 — one tap on a checklist cell. */
export async function recordChecklistCheckAction(input: { orderId: string; templateId: string; parameterName: string; slotTime: string; status: ChecklistStatus }) {
  return asResult(async () => {
    await recordChecklistCheck(input);
    revalidatePath(`/mis/qc/${input.orderId}`);
    revalidatePath('/mis/qc');
    revalidatePath('/mis/qc/grid');
  });
}
