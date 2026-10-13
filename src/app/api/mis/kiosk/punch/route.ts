import { ingestDevicePunch } from '@/server/mis/attendance-punch';

import { PUNCH_MAX_BODY_BYTES, PayloadTooLargeError, failure, ok, readJsonBody } from '../respond';

/**
 * A tablet sends one punch. Authenticates by device token before anything is read
 * (D18) and accepts a retired tablet's punches, flagged — they are real events.
 *
 * The answer is the verdict as a value: APPLIED, DUPLICATE, PARKED or REJECTED come
 * back 200 with the reason and detail the tablet shows (K2); only RETRY is a 503,
 * so a client that knows nothing about the contract still backs off.
 */
export async function POST(request: Request) {
  try {
    const authorization = request.headers.get('authorization');
    let body: unknown;
    try {
      body = await readJsonBody(request, PUNCH_MAX_BODY_BYTES);
    } catch (error) {
      // An over-limit body: still answer an un-tokened caller with 401 first (an empty envelope writes nothing).
      if (error instanceof PayloadTooLargeError) await ingestDevicePunch(authorization, {});
      throw error;
    }
    const out = await ingestDevicePunch(authorization, body);
    return ok(
      { outcome: out.outcome, reason: out.reason, detail: out.detail, result: out.result },
      out.outcome === 'RETRY' ? 503 : 200,
    );
  } catch (error) {
    return failure(error);
  }
}
