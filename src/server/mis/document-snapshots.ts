import { coaSnapshotFrom, jobCardSnapshotFrom, type BomInput, type DocSnapshot, type QcInput } from '@/lib/mis/document-snapshot';
import type { DocVersionType } from '@/lib/mis/document-version';
import { requirePermission } from '@/server/mis/auth';
import { getBom } from '@/server/mis/bom';
import { getPhasesForOrder } from '@/server/mis/job-phases';
import { getOrder } from '@/server/mis/orders';
import { getProductionSummary } from '@/server/mis/production';
import { getQcForOrder } from '@/server/mis/qc';
import { getCrewForOrder } from '@/server/mis/worker-allocation';

/**
 * R2-46 follow-up — capture a document's rendered data from the same live reads the print page uses
 * (each gated by its own permission: orders.read, qc.read, phase.read, production.read). Nothing is
 * caught: a version must not be issued with a partial snapshot.
 *
 * Gated itself (orders.read, the floor every read below also requires) so it is safe even if a
 * future caller forgets its own gate; the callers in document-versions.ts gate first as well.
 */
export async function captureDocumentSnapshot(docType: DocVersionType, refId: string): Promise<DocSnapshot> {
  await requirePermission('orders.read');
  const at = new Date();
  if (docType === 'COA') {
    const [order, qcLogs] = await Promise.all([getOrder(refId), getQcForOrder(refId)]);
    if (!order) throw new Error('Order not found.');
    return coaSnapshotFrom(order, qcLogs as unknown as QcInput[], at);
  }
  const [order, bom, production, phases, crew] = await Promise.all([
    getOrder(refId),
    getBom(refId),
    getProductionSummary(refId),
    getPhasesForOrder(refId),
    getCrewForOrder(refId),
  ]);
  if (!order) throw new Error('Order not found.');
  return jobCardSnapshotFrom({ order, bom: bom as unknown as BomInput, production, phases, crew }, at);
}
