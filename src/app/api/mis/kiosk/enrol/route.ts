import { requestEnrolment } from '@/server/mis/kiosk-device';

import { failure, ok, readJsonBody } from '../respond';

/** The tablet asks to be paired (D18). No credential exists yet; see kiosk-device.ts. */
export async function POST(request: Request) {
  try {
    const result = await requestEnrolment(await readJsonBody(request));
    return ok(
      {
        deviceId: result.deviceId,
        code: result.displayCode,
        pollSecret: result.pollSecret,
        expiresAt: result.expiresAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    return failure(error);
  }
}
