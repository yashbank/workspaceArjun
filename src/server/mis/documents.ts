import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';
import { getCurrentUser } from '@/server/auth';
import { logAuditEvent } from '@/server/mis/audit';

/** uploaded_by's FK targets auth.users(id) directly (Supabase's own id),
 * not user_profiles.id — the two are different UUIDs. Resolve display
 * names via authId, not id, and write authId on create. */
export async function withUploaderNames<T extends { uploadedBy: string | null }>(docs: T[]) {
  const authIds = [...new Set(docs.map((d) => d.uploadedBy).filter((id): id is string => !!id))];
  if (authIds.length === 0) return docs.map((d) => ({ ...d, uploadedByProfile: null }));
  const profiles = await db.userProfile.findMany({
    where: { authId: { in: authIds } },
    select: { authId: true, name: true, email: true },
  });
  const byAuthId = new Map(profiles.map((p) => [p.authId, p]));
  return docs.map((d) => ({
    ...d,
    uploadedByProfile: d.uploadedBy ? (byAuthId.get(d.uploadedBy) ?? null) : null,
  }));
}

export async function listDocuments(orderId: string) {
  await requirePermission('orders.read');
  const docs = await db.misDocument.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
  return withUploaderNames(docs);
}

export async function addDocument(orderId: string, data: {
  name: string;
  description?: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
}) {
  const actor = await requirePermission('orders.write');
  const user = await getCurrentUser();
  const rec = await db.misDocument.create({
    data: { orderId, ...data, uploadedBy: user?.authId },
  });
  await logAuditEvent({ actorId: actor.userId, action: 'ADD_DOCUMENT', entity: 'MisDocument', entityId: rec.id, after: rec });
  return rec;
}

export async function deleteDocument(documentId: string) {
  const actor = await requirePermission('orders.write');
  const doc = await db.misDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error('Document not found');
  await db.misDocument.delete({ where: { id: documentId } });
  await logAuditEvent({ actorId: actor.userId, action: 'DELETE_DOCUMENT', entity: 'MisDocument', entityId: documentId, before: doc });
}
