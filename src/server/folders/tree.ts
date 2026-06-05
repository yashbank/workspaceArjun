import { db } from '@/server/db';
import type { Prisma } from '@/generated/prisma/client';

/**
 * Controls which descendant folders are walked when collecting a subtree:
 * - 'active'      → only non-deleted folders (used when moving a tree to trash)
 * - 'any'         → every folder regardless of state (used when purging)
 * - { equals }    → folders trashed in a specific trash group (used when restoring)
 */
export type SubtreeWalk = 'active' | 'any' | { equals: Date };

const MAX_SUBTREE_DEPTH = 1000;

/**
 * Returns the id of `rootId` plus every descendant folder id, walking
 * breadth-first. The `walk` filter decides which descendants are followed so
 * the same helper serves soft-delete, restore, and permanent-delete without
 * sweeping in folders that belong to a different trash operation.
 */
export async function collectSubtreeFolderIds(
  rootId: string,
  walk: SubtreeWalk,
): Promise<string[]> {
  const all = [rootId];
  let frontier = [rootId];
  let depth = 0;

  while (frontier.length > 0 && depth < MAX_SUBTREE_DEPTH) {
    const where: Prisma.FolderWhereInput = { parentId: { in: frontier } };
    if (walk === 'active') {
      where.deletedAt = null;
    } else if (walk !== 'any') {
      where.deletedAt = walk.equals;
    }

    const children = await db.folder.findMany({ where, select: { id: true } });
    const childIds = children.map((c) => c.id);
    if (childIds.length === 0) break;

    all.push(...childIds);
    frontier = childIds;
    depth++;
  }

  return all;
}
