'use server';

import { asResult, type ActionResult } from '@/lib/mis/action-result';
import { searchMisEntities, type MisSearchResult } from '@/server/mis/search';

/** R2-144/145/148 — the global search behind both the desktop and mobile headers. Read-only; `searchMisEntities` itself is the gate. */
export async function searchMisAction(query: string): Promise<ActionResult<MisSearchResult[]>> {
  return asResult(() => searchMisEntities(query));
}
