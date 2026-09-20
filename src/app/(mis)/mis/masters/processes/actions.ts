'use server';
import { revalidatePath } from 'next/cache';
import { createProcess, updateProcess, deleteProcess, restoreProcess } from '@/server/mis/process';

export async function saveProcessAction(id: string | null, values: { code: string; name: string; nameHi?: string; departmentId?: string; standardTimeMinutes?: number }) {
  if (id) { await updateProcess(id, values); } else { await createProcess(values as any); }
  revalidatePath('/mis/masters/processes');
}
export async function deleteProcessAction(id: string) { await deleteProcess(id); revalidatePath('/mis/masters/processes'); }
export async function restoreProcessAction(id: string) { await restoreProcess(id); revalidatePath('/mis/masters/processes'); }
