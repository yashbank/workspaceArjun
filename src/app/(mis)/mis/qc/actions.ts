'use server';
import { addQcCheck, recordAqlSample, type AqlDefectLine } from '@/server/mis/qc';
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
