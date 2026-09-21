import type { MasterKey, MasterListView, DirectoryEntry } from '@/lib/mis/master-directory';
import { isMisForbiddenError } from '@/server/mis/auth';
import { getMasterDirectory, getMasterList } from '@/server/mis/master-directory';

import { MasterDataDesktop } from './master-data-desktop';

/**
 * The server half of D10: it asks for the directory and the list, and hands the answer to the screen.
 *
 * A second query on a page the phone also serves, so a failure is LOGGED (never swallowed) and the desktop half
 * says it could not load — the phone screen still renders. A refusal is "no access", not "could not load".
 */
export async function MasterDataDesktopServer({ master, searchParams }: { master: MasterKey; searchParams: { q?: unknown; deactivated?: unknown; edit?: unknown; create?: unknown; error?: unknown } }) {
  let directory: DirectoryEntry[] | null = null;
  let list: MasterListView | null = null;
  let denied = false;
  try {
    [directory, list] = await Promise.all([getMasterDirectory(), getMasterList(master, searchParams)]);
  } catch (error) {
    if (isMisForbiddenError(error)) denied = true;
    else console.error('[mis-masters] the master data failed to load', error);
  }
  return <MasterDataDesktop directory={directory} list={list} denied={denied} />;
}
