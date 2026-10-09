'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';

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
  return asResult(async () => {
    const created = await createMaterialRequest(lines, meta);
    revalidate();
    return { id: created.id, requestNumber: created.requestNumber };
  });
}

export async function approveMaterialRequestAction(id: string, decisions: ApproveLineInput[], note?: string | null) {
  return asResult(async () => {
    try {
      return await approveMaterialRequest(id, decisions, note);
    } finally {
      revalidate(id); // a refused approve re-opens the note on the server — the screen must show that too
    }
  });
}

export async function rejectMaterialRequestAction(id: string, reason: string) {
  return asResult(async () => {
    await rejectMaterialRequest(id, reason);
    revalidate(id);
  });
}
