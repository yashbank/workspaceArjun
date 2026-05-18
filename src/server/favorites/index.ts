import { db } from '@/server/db';
import { requireUser } from '@/server/auth';

export async function listFavorites(userId: string) {
  return db.favorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function addFavorite(targetType: 'file' | 'folder', targetId: string) {
  const user = await requireUser();
  return db.favorite.upsert({
    where: { userId_targetType_targetId: { userId: user.id, targetType, targetId } },
    update: {},
    create: { userId: user.id, targetType, targetId },
  });
}

export async function removeFavorite(targetType: 'file' | 'folder', targetId: string) {
  const user = await requireUser();
  await db.favorite.deleteMany({
    where: { userId: user.id, targetType, targetId },
  });
}

export async function isFavorited(
  userId: string,
  targetType: 'file' | 'folder',
  targetId: string,
): Promise<boolean> {
  const fav = await db.favorite.findFirst({
    where: { userId, targetType, targetId },
  });
  return !!fav;
}
