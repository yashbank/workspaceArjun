import { NextResponse } from 'next/server';

import { KioskDeviceError, kioskErrorStatus } from '@/server/mis/kiosk-device';

/**
 * Shared by the three kiosk routes so each stays a few lines (thin-handler rule).
 * Everything here is `no-store`: a token or a roll must never sit in a proxy cache.
 */
const NO_STORE = { 'Cache-Control': 'no-store' };

/** Pairing and health bodies are tiny. A large one is not from a tablet. */
const MAX_BODY_BYTES = 4096;
/** A punch envelope carries a payload and a health report, so it gets more room (R3 B59). */
export const PUNCH_MAX_BODY_BYTES = 16 * 1024;

/** R3 B59: an over-limit body is refused with 413, never quietly read as `{}`. */
export class PayloadTooLargeError extends Error {
  constructor() {
    super('PAYLOAD_TOO_LARGE');
  }
}

export async function readJsonBody(request: Request, limit: number = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > limit) throw new PayloadTooLargeError();
  let text: string;
  try {
    text = await request.text();
  } catch {
    return {};
  }
  if (new TextEncoder().encode(text).length > limit) throw new PayloadTooLargeError();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

export function ok(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function failure(error: unknown) {
  if (error instanceof PayloadTooLargeError) {
    return NextResponse.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413, headers: NO_STORE });
  }
  if (error instanceof KioskDeviceError) {
    const status = kioskErrorStatus(error.code);
    // A retired tablet is told to wipe its local list (K10). Nothing else is added
    // to a refusal: never which credential was wrong, never a token.
    const body = error.code === 'REVOKED' ? { error: 'REVOKED', wipe: true } : { error: error.code, message: error.message };
    return NextResponse.json(body, { status, headers: NO_STORE });
  }
  // Unexpected: say nothing about it. The message could name a table or a query.
  return NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500, headers: NO_STORE });
}
