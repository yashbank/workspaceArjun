import type { DocLibraryView } from '@/lib/mis/document-library';
import { isMisForbiddenError } from '@/server/mis/auth';
import { getDocumentLibrary } from '@/server/mis/document-library';

import { DocumentsDesktop } from './documents-desktop';

/**
 * The server half of D13. A refusal is "no access"; any other failure is LOGGED (never swallowed) and the desktop half
 * says so — the phone screen still renders.
 */
export async function DocumentsDesktopServer({ searchParams }: { searchParams: { q?: unknown; group?: unknown; doc?: unknown; page?: unknown; add?: unknown; added?: unknown } }) {
  let view: DocLibraryView | null = null;
  let denied = false;
  try {
    view = await getDocumentLibrary(searchParams);
  } catch (error) {
    if (isMisForbiddenError(error)) denied = true;
    else console.error('[mis-documents] the library failed to load', error);
  }
  return <DocumentsDesktop view={view} denied={denied} />;
}
