import { NextResponse } from 'next/server';
import {
  ACCESS_BLOCKED_MESSAGE,
  ACCESS_BLOCKED_CODE,
  isAccessBlockedError,
} from '@/server/access/errors';

export { isAccessBlockedError };

/** Standard 403 body returned by protected APIs when access is blocked. */
export function accessBlockedResponse(): NextResponse {
  return NextResponse.json(
    { error: ACCESS_BLOCKED_MESSAGE, code: ACCESS_BLOCKED_CODE },
    { status: 403 },
  );
}
