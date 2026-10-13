'use server';
import type { QueuedWriteEnvelope } from '@/lib/mis/offline/idempotency';
import { asResult } from '@/lib/mis/action-result';
import { editProductionLog, getProductionFormContext, submitProductionLog, type ProductionLogPatch, type ProductionLogPayload } from '@/server/mis/production';
import { isMisForbiddenError } from '@/server/mis/auth';
import { clearLine, listClearanceHistory } from '@/server/mis/line-clearance';
import { revalidatePath } from 'next/cache';

/**
 * Both entry points return an outcome; neither throws one. In a production build
 * React replaces anything a server action throws with a generic message, so a
 * screen deciding what to show from `error.message` works in development and
 * silently breaks in production (Appendix B §B.10.3).
 */
type Envelope = QueuedWriteEnvelope<ProductionLogPayload>;

function revalidateFor(orderId: string) {
  revalidatePath('/mis/production');
  revalidatePath(`/mis/production/${orderId}`);
  revalidatePath(`/mis/orders/${orderId}`);
}

/**
 * A live attempt — the person is at the screen with signal (Appendix B §B.10.1).
 * A refusal comes back to them to fix and resend under the same key; nothing is
 * recorded server-side, so that recovery keeps working.
 */
export async function submitProductionLiveAction(envelope: Envelope) {
  const out = await submitProductionLog(envelope, { live: true });
  if (out.outcome === 'APPLIED' && out.result) revalidateFor(out.result.orderId);
  return out;
}

/**
 * A write coming from the offline queue. Refusals are parked durably, with the
 * payload, so they survive a lost tablet (§B.7). `retry` is a human asking for a
 * held write to be replayed; the server honours it only for the reasons D17 lists.
 */
export async function replayProductionAction(envelope: Envelope, retry = false) {
  const out = await submitProductionLog(envelope, { retry });
  if (out.outcome === 'APPLIED' && out.result) revalidateFor(out.result.orderId);
  return out;
}

/**
 * R3 B127: every action below returns an `ActionResult`, so a refusal reaches the screen as data
 * (React hides a thrown message in production). `clearLine`'s permission refusal is translated
 * into a sentence here rather than escaping to the error boundary, as it always was.
 */
export async function clearLineAction(data: { machineId: string; orderId?: string | null; notes?: string }) {
  const result = await asResult(async () => {
    try {
      await clearLine(data);
    } catch (error) {
      if (isMisForbiddenError(error)) throw new Error('Only a supervisor or above can clear a line.');
      throw error;
    }
  });
  if (result.ok) {
    revalidatePath('/mis/production');
    revalidatePath('/mis');
  }
  return result;
}

export async function getClearanceHistoryAction(machineId: string) {
  return asResult(async () => {
    const rows = await listClearanceHistory(machineId, 5);
    return rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      clearedAt: r.clearedAt.toISOString(),
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      orderNumber: r.order?.orderNumber ?? null,
      shiftName: r.shift?.name ?? null,
    }));
  });
}

/** Stages of the chosen order's BOM and its allocated machine(s), to fill the log form (#18, #39). */
export async function getProductionFormContextAction(orderId: string) {
  return asResult(() => getProductionFormContext(orderId));
}

/** R3 B126: edit an entry within 24 h. */
export async function editProductionLogAction(id: string, patch: ProductionLogPatch) {
  const result = await asResult(async () => {
    const rec = await editProductionLog(id, patch);
    return { id: rec.id, orderId: rec.orderId };
  });
  if (result.ok) revalidateFor(result.value.orderId);
  return result;
}
