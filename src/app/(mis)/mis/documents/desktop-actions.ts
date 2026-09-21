'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { saveDocumentLink } from '@/server/mis/document-library';

/**
 * The form action behind D13's "Add document". Thin on purpose: `saveDocumentLink` holds the `orders.write` gate, the
 * order-visibility check, the link-safety check and (through `addDocument`) the audit row. A failure comes back as a
 * message WITH what was typed, so a dropped connection or a typo never costs the person the form they had filled;
 * the place to return to is fixed here, never taken from the form. `redirect()` throws to leave the action, so it is
 * called OUTSIDE the try/catch.
 */

export type AddDocumentState = { error: string | null; values?: { orderId: string; name: string; description: string; link: string } };

const PAGE = '/mis/documents';

export async function addDocumentLinkAction(_previous: AddDocumentState, formData: FormData): Promise<AddDocumentState> {
  const values = {
    orderId: String(formData.get('orderId') ?? ''),
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    link: String(formData.get('link') ?? ''),
  };
  try {
    await saveDocumentLink(values);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not add the document', values };
  }
  revalidatePath(PAGE);
  redirect(`${PAGE}?added=1`);
}
