'use server';
import { revalidatePath } from 'next/cache';
import { createDept, updateDept, deleteDept, restoreDept, reorderDepts } from '@/server/mis/department';

export async function saveDeptAction(id: string | null, values: { code: string; name: string; nameHi?: string; sortOrder?: number }) {
  if (id) { await updateDept(id, values); } else { await createDept(values as any); }
  revalidatePath('/mis/masters/departments');
}
export async function deleteDeptAction(id: string) {
  await deleteDept(id);
  revalidatePath('/mis/masters/departments');
}
export async function restoreDeptAction(id: string) {
  await restoreDept(id);
  revalidatePath('/mis/masters/departments');
}
export async function reorderDeptsAction(orderedIds: string[]) {
  await reorderDepts(orderedIds);
  revalidatePath('/mis/masters/departments');
}
