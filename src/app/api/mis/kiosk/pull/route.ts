import { pullForDevice } from '@/server/mis/kiosk-device';

import { failure, ok, readJsonBody } from '../respond';

/** The tablet pulls its employee list. Authenticates by bearer token before anything is read. */
export async function POST(request: Request) {
  try {
    return ok(await pullForDevice(request.headers.get('authorization'), await readJsonBody(request)));
  } catch (error) {
    return failure(error);
  }
}
