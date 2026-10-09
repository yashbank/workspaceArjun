'use server';
import { revalidatePath } from 'next/cache';

import {
  approveMaterialRequest,
  createMaterialRequest,
  rejectMaterialRequest,
  type ApproveLineInput,
  type MaterialRequestLineInput,
  type MaterialRequestMeta,
} from '@/server/mis/material-request';

function revalidate(id?: string) {
  revalidatePath('/mis/store/requests');
  if (id) revalidatePath(`/mis/store/requests/${id}`);
  revalidatePath('/mis/store');
  revalidatePath('/mis/store/stock');
  revalidatePath('/mis/store/transactions');
  revalidatePath('/mis/inventory');
}

export async function createMaterialRequestAction(lines: MaterialRequestLineInput[], meta: MaterialRequestMeta) {
  const created = await createMaterialRequest(lines, meta);
  revalidate();
  return { id: created.id, requestNumber: created.requestNumber };
}

export async function approveMaterialRequestAction(id: string, decisions: ApproveLineInput[], note?: string | null) {
  const result = await approveMaterialRequest(id, decisions, note);
  revalidate(id);
  return result;
}

export async function rejectMaterialRequestAction(id: string, reason: string) {
  await rejectMaterialRequest(id, reason);
  revalidate(id);
}
