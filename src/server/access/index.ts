import type { AccessMode, UserRole } from '@/generated/prisma/client';

export {
  extractRequestIp,
  normalizeIp,
  isValidIpOrCidr,
  ipMatchesRange,
  ipMatchesAny,
} from './ip';
export {
  DEVICE_COOKIE_NAME,
  DEVICE_TOKEN_BYTES,
  generateDeviceToken,
  hashDeviceToken,
  verifyDeviceToken,
} from './device';

/** Owner and admin always bypass access restrictions. */
export function isAccessBypassed(role: UserRole): boolean {
  return role === 'owner' || role === 'admin';
}

export type AccessFacts = {
  ipAllowed: boolean;
  deviceApproved: boolean;
};

/**
 * Pure policy evaluation for an access mode. Does NOT apply the role bypass and
 * does NOT enforce anything — a later phase decides what to do with the result.
 * Unknown modes fail closed.
 */
export function evaluateAccess(mode: AccessMode, facts: AccessFacts): boolean {
  switch (mode) {
    case 'unrestricted':
      return true;
    case 'ip':
      return facts.ipAllowed;
    case 'device':
      return facts.deviceApproved;
    case 'ip_and_device':
      return facts.ipAllowed && facts.deviceApproved;
    case 'ip_or_device':
      return facts.ipAllowed || facts.deviceApproved;
    default:
      return false;
  }
}

/**
 * Full pure decision, including owner/admin bypass. Side-effect free — nothing
 * is blocked in this phase; callers in a later phase will enforce.
 */
export function isAccessAllowed(args: {
  role: UserRole;
  mode: AccessMode;
  ipAllowed: boolean;
  deviceApproved: boolean;
}): boolean {
  if (isAccessBypassed(args.role)) return true;
  return evaluateAccess(args.mode, {
    ipAllowed: args.ipAllowed,
    deviceApproved: args.deviceApproved,
  });
}
