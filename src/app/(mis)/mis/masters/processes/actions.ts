'use server';
import { revalidatePath } from 'next/cache';
import { createProcess, updateProcess, deleteProcess, restoreProcess, type ProcessInput } from '@/server/mis/process';

export async function saveProcessAction(id: string | null, values: ProcessInput) {
  if (id) { await updateProcess(id, values); } else { await createProcess(values); }
  revalidatePath('/mis/masters/processes');
}
export async function deleteProcessAction(id: string) { await deleteProcess(id); revalidatePath('/mis/masters/processes'); }
export async function restoreProcessAction(id: string) { await restoreProcess(id); revalidatePath('/mis/masters/processes'); }
