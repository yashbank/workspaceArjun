'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { handOverPickList, recordPicks, stagePickList } from '@/server/mis/pick-list';

/** A handover moves stock, so everything a stock movement touches is re-rendered. */
function revalidate(id: string, stock = false) {
  revalidatePath('/mis/store/pick-lists');
  revalidatePath(`/mis/store/pick-lists/${id}`);
  revalidatePath('/mis/store/requests');
  if (stock) {
    for (const p of ['/mis/store', '/mis/store/stock', '/mis/store/dashboard', '/mis/store/transactions', '/mis/inventory']) revalidatePath(p);
  }
}

export async function recordPicksAction(id: string, picks: { lineId: string; pickedQty: number }[]) {
  return asResult(async () => { try { await recordPicks(id, picks); } finally { revalidate(id); } });
}

export async function stagePickListAction(id: string) {
  return asResult(async () => { try { await stagePickList(id); } finally { revalidate(id); } });
}

export async function handOverPickListAction(id: string) {
  return asResult(async () => { try { return await handOverPickList(id); } finally { revalidate(id, true); } });
}
