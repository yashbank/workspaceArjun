'use server';

import { revalidatePath } from 'next/cache';

import { isMisForbiddenError } from '@/server/mis/auth';
import {
  createBackup,
  DataResetError,
  deleteSelectedData,
  previewDelete,
  restoreBackup,
} from '@/server/mis/data-reset';

/**
 * Outcomes are returned as values, not thrown (same lesson as the gate-tablet actions): React hides a thrown
 * server-action message in production, and the Owner needs to read "take a fresh backup first".
 */
export type DangerResult<T = object> = ({ ok: true } & T) | { ok: false; detail: string };

async function outcome<T extends object>(run: () => Promise<T>): Promise<DangerResult<T>> {
  try {
    const value = await run();
    revalidatePath('/mis/settings/danger-zone');
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof DataResetError) return { ok: false, detail: error.message };
    if (isMisForbiddenError(error)) return { ok: false, detail: 'Only the Owner can use the Danger Zone.' };
    throw error;
  }
}

export async function previewDeleteAction(groupIds: string[]) {
  return outcome(() => previewDelete({ groupIds }));
}

export async function createBackupAction() {
  return outcome(async () => ({ backup: await createBackup() }));
}

export async function deleteDataAction(groupIds: string[], backupId: string, confirm: string) {
  return outcome(() => deleteSelectedData({ groupIds, backupId, confirm }));
}

export async function restoreBackupAction(backupId: string, confirm: string) {
  return outcome(() => restoreBackup({ backupId, confirm }));
}
