import { headers, cookies } from 'next/headers';
import { db } from '@/server/db';
import { logAuditEvent } from '@/server/audit';
import type { UserProfile } from '@/generated/prisma/client';
import { extractRequestIp, ipMatchesAny } from './ip';
import { DEVICE_COOKIE_NAME, verifyDeviceToken } from './device';
import { isAccessBypassed, evaluateAccess } from './index';

export type AccessDeviceStatus = 'none' | 'pending' | 'approved' | 'revoked';

export type AccessDecision = {
  allowed: boolean;
  /** True when the user would be blocked under enforcement (Phase 2 only logs). */
  wouldBlock: boolean;
  reason: string;
  ip: string | null;
  userAgent: string | null;
  deviceStatus: AccessDeviceStatus;
};

/**
 * Evaluates the access policy for a profile against the current request (IP from
 * headers + device cookie + DB allowlist/devices). Side-effect free — it only
 * computes a decision; callers decide what to do. Owner/admin and unrestricted
 * members always pass.
 */
export async function resolveAccessDecision(
  profile: Pick<UserProfile, 'id' | 'role' | 'accessMode'>,
): Promise<AccessDecision> {
  const hdrs = await headers();
  const ip = extractRequestIp(hdrs);
  const userAgent = hdrs.get('user-agent');

  if (isAccessBypassed(profile.role) || profile.accessMode === 'unrestricted') {
    return { allowed: true, wouldBlock: false, reason: 'bypass', ip, userAgent, deviceStatus: 'none' };
  }

  // IP allowlist: the member's own ranges + workspace-wide ranges (userId null).
  let ipAllowed = false;
  if (profile.accessMode !== 'device') {
    const ranges = await db.allowedIpRange.findMany({
      where: { OR: [{ userId: profile.id }, { userId: null }] },
      select: { value: true },
    });
    ipAllowed = ipMatchesAny(
      ip,
      ranges.map((r) => r.value),
    );
  }

  // Device: cookie token → an approved, non-revoked device for this member or a
  // shared (userId null) office device.
  let deviceApproved = false;
  let deviceStatus: AccessDeviceStatus = 'none';
  if (profile.accessMode !== 'ip') {
    const cookieStore = await cookies();
    const token = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
    if (token) {
      const devices = await db.approvedDevice.findMany({
        where: { OR: [{ userId: profile.id }, { userId: null }], revokedAt: null },
        select: { tokenHash: true, status: true },
      });
      const match = devices.find((d) => verifyDeviceToken(token, d.tokenHash));
      if (match) {
        deviceStatus = match.status;
        deviceApproved = match.status === 'approved';
      }
    }
  }

  const allowed = evaluateAccess(profile.accessMode, { ipAllowed, deviceApproved });
  return {
    allowed,
    wouldBlock: !allowed,
    reason: allowed
      ? 'allowed'
      : `mode=${profile.accessMode};ip=${ipAllowed};device=${deviceStatus}`,
    ip,
    userAgent,
    deviceStatus,
  };
}

const DENIAL_LOG_WINDOW_MS = 5 * 60 * 1000;
const lastDenialLogAt = new Map<string, number>();

/**
 * Log-only denial recorder. Writes an `access.denied` audit event the first time
 * a user would be blocked within a short window (throttled per user to avoid
 * noisy duplicate logs across a page's many requests). Never blocks — Phase 2 is
 * observation only, so the event is tagged `enforced: false`.
 */
export async function logAccessDenial(profile: UserProfile, decision: AccessDecision): Promise<void> {
  const now = Date.now();
  const last = lastDenialLogAt.get(profile.id) ?? 0;
  if (now - last < DENIAL_LOG_WINDOW_MS) return;
  lastDenialLogAt.set(profile.id, now);

  await logAuditEvent({
    actor: profile,
    action: 'access.denied',
    targetType: 'access',
    meta: {
      mode: profile.accessMode,
      reason: decision.reason,
      deviceStatus: decision.deviceStatus,
      enforced: false,
    },
    ip: decision.ip ?? undefined,
    userAgent: decision.userAgent ?? undefined,
  });
}
