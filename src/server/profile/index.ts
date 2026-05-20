import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth';
import type { UserProfile } from '@/generated/prisma/client';
import {
  DISPLAY_NAME_TAKEN,
  normalizeDisplayName,
} from '@/lib/display-name';

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 64;

export async function findDisplayNameConflict(
  name: string,
  excludeUserId?: string,
): Promise<{ id: string; name: string | null } | null> {
  const normalized = normalizeDisplayName(name);
  const rows = await db.userProfile.findMany({
    where: {
      name: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true, name: true },
  });
  return rows.find((r) => r.name && normalizeDisplayName(r.name) === normalized) ?? null;
}

export async function userHasDuplicateDisplayName(userId: string): Promise<boolean> {
  const user = await db.userProfile.findUnique({
    where: { id: userId },
    select: { name: true },
  });
  if (!user?.name?.trim()) return false;
  const conflict = await findDisplayNameConflict(user.name, userId);
  return conflict !== null;
}

export async function updateOwnDisplayName(name: string): Promise<UserProfile> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME_LENGTH) {
    throw new Error(`Display name must be at least ${MIN_NAME_LENGTH} characters`);
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Display name must be at most ${MAX_NAME_LENGTH} characters`);
  }

  const conflict = await findDisplayNameConflict(trimmed, user.id);
  if (conflict) {
    throw new Error(DISPLAY_NAME_TAKEN);
  }

  return db.userProfile.update({
    where: { id: user.id },
    data: { name: trimmed },
  });
}
