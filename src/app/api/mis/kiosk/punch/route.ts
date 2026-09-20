import { ingestDevicePunch } from '@/server/mis/attendance-punch';

import { failure, ok, readJsonBody } from '../respond';

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
    const out = await ingestDevicePunch(request.headers.get('authorization'), await readJsonBody(request));
    return ok(
      { outcome: out.outcome, reason: out.reason, detail: out.detail, result: out.result },
      out.outcome === 'RETRY' ? 503 : 200,
    );
  } catch (error) {
    return failure(error);
  }
}
