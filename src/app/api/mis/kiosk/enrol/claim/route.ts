import { claimEnrolment } from '@/server/mis/kiosk-device';

import { failure, ok, readJsonBody } from '../../respond';

/** The tablet collects its token once an Admin has approved it. Proves itself with the poll secret. */
export async function POST(request: Request) {
  try {
    const result = await claimEnrolment(await readJsonBody(request));
    return ok(result.status === 'PENDING' ? { status: result.status, expiresAt: result.expiresAt.toISOString() } : result);
  } catch (error) {
    return failure(error);
  }
}
