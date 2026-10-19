'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { createStoreReturn, decideStoreReturn, type StoreReturnInput } from '@/server/mis/store-return';

function revalidate() {
  for (const p of ['/mis/store/returns', '/mis/store', '/mis/store/stock', '/mis/store/dashboard', '/mis/store/transactions', '/mis/inventory']) revalidatePath(p);
}

export async function createStoreReturnAction(input: StoreReturnInput) {
  return asResult(async () => { try { return await createStoreReturn(input); } finally { revalidate(); } });
}

export async function decideStoreReturnAction(id: string, decision: 'ACCEPT' | 'REJECT', note?: string | null) {
  return asResult(async () => { try { await decideStoreReturn(id, decision, note); } finally { revalidate(); } });
}
