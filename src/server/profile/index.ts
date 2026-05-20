import { db } from '@/server/db';
import { getCurrentUser } from '@/server/auth';
import type { UserProfile } from '@/generated/prisma/client';

const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 64;

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

  return db.userProfile.update({
    where: { id: user.id },
    data: { name: trimmed },
  });
}
