'use server';
import { revalidatePath } from 'next/cache';
import { asResult } from '@/lib/mis/action-result';
import { createDept, updateDept, deleteDept, restoreDept, reorderDepts, type DeptInput } from '@/server/mis/department';

export async function saveDeptAction(id: string | null, values: DeptInput) {
  return asResult(async () => {
    if (id) { await updateDept(id, values); } else { await createDept(values); }
    revalidatePath('/mis/masters/departments');
  }, { entity: 'Department', fields: values });
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
