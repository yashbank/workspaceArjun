import { db } from '@/server/db';
import { requirePermission } from '@/server/rbac';
import { logAuditEvent } from '@/server/audit';
import { isValidIpOrCidr } from '@/server/access/ip';
import { isAccessEnforced, isAccessDetectionEnabled } from '@/server/access/errors';
import type {
  AccessMode,
  AllowedIpRange,
  DeviceStatus,
  UserProfile,
  UserRole,
  UserStatus,
} from '@/generated/prisma/client';

const ACCESS_MODES: AccessMode[] = ['unrestricted', 'ip', 'device', 'ip_and_device', 'ip_or_device'];

/** Max recent denial events surfaced in the security overview. */
const DENIALS_LIMIT = 100;

export function isValidAccessMode(value: string): value is AccessMode {
  return (ACCESS_MODES as string[]).includes(value);
}

export type AccessOverview = {
  users: {
    id: string;
    email: string;
    name: string | null;
    role: UserRole;
    status: UserStatus;
    accessMode: AccessMode;
  }[];
  ipRanges: {
    id: string;
    userId: string | null;
    value: string;
    label: string | null;
    createdAt: Date;
  }[];
  devices: {
    id: string;
    userId: string | null;
    status: DeviceStatus;
    userAgent: string | null;
    browser: string | null;
    deviceLabel: string | null;
    lastIp: string | null;
    createdAt: Date;
    approvedAt: Date | null;
    lastSeenAt: Date | null;
    revokedAt: Date | null;
  }[];
  denials: {
    id: string;
    createdAt: Date;
    ip: string | null;
    userAgent: string | null;
    meta: unknown;
    actor: { id: string; email: string; name: string | null; role: UserRole } | null;
  }[];
  /** Live runtime flags so admins can verify the deployed env, not secrets. */
  accessDetectionEnabled: boolean;
  accessEnforcementEnabled: boolean;
};

/** Owner/admin-only snapshot for the admin security page. Read-only. */
export async function listAccessOverview(): Promise<AccessOverview> {
  await requirePermission('users:manage');

  const [users, ipRanges, devices, denials] = await Promise.all([
    db.userProfile.findMany({
      select: { id: true, email: true, name: true, role: true, status: true, accessMode: true },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    }),
    db.allowedIpRange.findMany({
      select: { id: true, userId: true, value: true, label: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.approvedDevice.findMany({
      select: {
        id: true,
        userId: true,
        status: true,
        userAgent: true,
        browser: true,
        deviceLabel: true,
        lastIp: true,
        createdAt: true,
        approvedAt: true,
        lastSeenAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.auditEvent.findMany({
      where: { action: 'access.denied' },
      orderBy: { createdAt: 'desc' },
      take: DENIALS_LIMIT,
      select: {
        id: true,
        createdAt: true,
        ip: true,
        userAgent: true,
        meta: true,
        actor: { select: { id: true, email: true, name: true, role: true } },
      },
    }),
  ]);

  return {
    users,
    ipRanges,
    devices,
    denials,
    accessDetectionEnabled: isAccessDetectionEnabled(),
    accessEnforcementEnabled: isAccessEnforced(),
  };
}

/**
 * Updates a user's access mode. Owner/admin always bypass access restrictions, so
 * they can never be put into a restricted mode (anti-lockout).
 */
export async function setUserAccessMode(userId: string, accessMode: AccessMode): Promise<UserProfile> {
  const actor = await requirePermission('users:manage');

  const target = await db.userProfile.findUnique({ where: { id: userId } });
  if (!target) throw new Error('User not found');

  if ((target.role === 'owner' || target.role === 'admin') && accessMode !== 'unrestricted') {
    throw new Error('Owner and admin always bypass access restrictions');
  }

  const updated = await db.userProfile.update({
    where: { id: userId },
    data: { accessMode },
  });

  await logAuditEvent({
    actor,
    action: 'user.access_mode_change',
    targetType: 'user',
    targetId: userId,
    meta: { email: target.email, oldMode: target.accessMode, newMode: accessMode },
  });

  return updated;
}

/**
 * Adds an allowed IP/CIDR range. `userId` null = workspace-wide. The value is
 * validated server-side (never trust the client).
 */
export async function addAllowedIpRange(input: {
  value: string;
  label?: string | null;
  userId?: string | null;
}): Promise<AllowedIpRange> {
  const actor = await requirePermission('users:manage');

  const value = input.value.trim();
  if (!isValidIpOrCidr(value)) {
    throw new Error('Invalid IP address or CIDR range');
  }

  if (input.userId) {
    const target = await db.userProfile.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!target) throw new Error('User not found');
  }

  const range = await db.allowedIpRange.create({
    data: {
      value,
      label: input.label?.trim() || null,
      userId: input.userId ?? null,
      createdById: actor.id,
    },
  });

  await logAuditEvent({
    actor,
    action: 'settings.change',
    targetType: 'access_ip_range',
    targetId: range.id,
    meta: { added: true, value, label: range.label, userId: range.userId },
  });

  return range;
}

export async function removeAllowedIpRange(id: string): Promise<void> {
  const actor = await requirePermission('users:manage');

  const existing = await db.allowedIpRange.findUnique({ where: { id } });
  if (!existing) throw new Error('IP range not found');

  await db.allowedIpRange.delete({ where: { id } });

  await logAuditEvent({
    actor,
    action: 'settings.change',
    targetType: 'access_ip_range',
    targetId: id,
    meta: { removed: true, value: existing.value, userId: existing.userId },
  });
}
