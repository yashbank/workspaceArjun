'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import type { DocVersionType } from '@/lib/mis/document-version';
import { approveDocumentVersion, prepareDocumentVersion, updateDocumentVersionToLatest } from '@/server/mis/document-versions';

/** R2-46: both return an `ActionResult` so a refusal is shown on the print page; a permission refusal is thrown. */
const PATH: Record<DocVersionType, string> = { COA: '/mis/print/coa', JOB_CARD: '/mis/print/job-card' };

export async function prepareDocumentVersionAction(docType: DocVersionType, refId: string, notes?: string) {
  return asResult(async () => {
    const rec = await prepareDocumentVersion(docType, refId, notes);
    revalidatePath(`${PATH[docType]}/${refId}`);
    return { id: rec.id, version: rec.version };
  });
}

export async function approveDocumentVersionAction(versionId: string) {
  return asResult(async () => {
    const rec = await approveDocumentVersion(versionId);
    revalidatePath(`${PATH[rec.docType as DocVersionType] ?? '/mis/print'}/${rec.refId}`);
    return { id: rec.id, version: rec.version };
  });
}

/** R2-46 follow-up: Admin/Owner issue V(n+1) from live data off an approved version; it then needs approval. */
export async function updateDocumentVersionToLatestAction(versionId: string) {
  return asResult(async () => {
    const rec = await updateDocumentVersionToLatest(versionId);
    revalidatePath(`${PATH[rec.docType as DocVersionType] ?? '/mis/print'}/${rec.refId}`);
    return { id: rec.id, version: rec.version };
  });
}
