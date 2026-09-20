'use server';
import { addDocument, deleteDocument } from '@/server/mis/documents';
import { revalidatePath } from 'next/cache';

export async function addDocumentAction(orderId: string, data: {
  name: string;
  description?: string;
  filePath: string;
  fileSize?: number;
  mimeType?: string;
}) {
  await addDocument(orderId, data);
  revalidatePath('/mis/documents');
}

export async function deleteDocumentAction(documentId: string) {
  await deleteDocument(documentId);
  revalidatePath('/mis/documents');
}
