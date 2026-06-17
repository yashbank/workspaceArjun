import { cookies, headers } from 'next/headers';
import { db } from '@/server/db';
import { requireUser } from '@/server/auth';
import { logAuditEvent } from '@/server/audit';
import { extractRequestIp } from './ip';
import { DEVICE_COOKIE_NAME, generateDeviceToken, hashDeviceToken } from './device';
import { describeBrowser } from './ua';

/** Device cookie lifetime — one year; refreshed implicitly on each enrollment. */
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Enrolls the CURRENT user's browser as an approved device using the
 * owner-issued access code. The code proves the owner authorized this person,
 * so the device is approved immediately and bound to a fresh httpOnly token
 * cookie. The device's browser label + last IP are recorded for the Owner's
 * Approved Devices list. Throws on a missing/incorrect code.
 */
export async function enrollDeviceWithCode(rawCode: string): Promise<{ browser: string }> {
  const user = await requireUser();
  const code = rawCode.trim().toUpperCase();
  if (!code) throw new Error('Enter your access code');
  // Codes use an uppercase alphabet, so a case-folded exact match is correct.
  if (!user.accessCode || code !== user.accessCode) {
    throw new Error('That access code is not valid');
  }

  const hdrs = await headers();
  const ua = hdrs.get('user-agent');
  const ip = extractRequestIp(hdrs);
  const browser = describeBrowser(ua);

  const token = generateDeviceToken();
  await db.approvedDevice.create({
    data: {
      userId: user.id,
      tokenHash: hashDeviceToken(token),
      status: 'approved',
      userAgent: ua ?? undefined,
      browser,
      lastIp: ip ?? undefined,
      approvedAt: new Date(),
      approvedById: user.id,
      lastSeenAt: new Date(),
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_COOKIE_MAX_AGE,
  });

  await logAuditEvent({
    actor: user,
    action: 'device.approve',
    targetType: 'device',
    meta: { self: true, browser },
    ip: ip ?? undefined,
    userAgent: ua ?? undefined,
  });

  return { browser };
}
