'use server';

import { revalidatePath } from 'next/cache';

import type { QueuedWriteEnvelope } from '@/lib/mis/offline/idempotency';
import { submitPunch, type PunchPayload } from '@/server/mis/attendance-punch';

/**
 * Both entry points return an outcome; neither throws one — in a production build
 * React replaces anything a server action throws with a generic message, so a
 * screen deciding what to show from `error.message` would work in development and
 * break in production (Appendix B §B.10.3).
 *
 * These replace `kioskClockInAction` / `kioskClockOutAction`, which stamped the
 * SERVER's clock on a punch. A punch carries the device's time (D15), so a
 * server-stamped clock-in was wrong for exactly the case the kiosk exists for: a
 * tablet with no signal.
 */
type Envelope = QueuedWriteEnvelope<PunchPayload>;

/**
 * A live attempt — the operator is at the screen with signal (§B.10.1). A refusal
 * comes back to them and nothing is recorded server-side, so they can fix the
 * cause and tap again under the same key.
 */
export async function submitPunchLiveAction(envelope: Envelope) {
  const out = await submitPunch(envelope, { live: true });
  if (out.outcome === 'APPLIED') revalidatePath('/mis/kiosk');
  return out;
}

/**
 * A punch coming from the offline queue. Refusals are parked durably, with the
 * payload, so they survive a lost tablet (§B.7). `retry` is a human asking for a
 * held write to be replayed; the server honours it only for the reasons D17 lists —
 * none of the punch reasons is one of them (D21).
 */
export async function replayPunchAction(envelope: Envelope, retry = false) {
  const out = await submitPunch(envelope, { retry });
  if (out.outcome === 'APPLIED') revalidatePath('/mis/kiosk');
  return out;
}
