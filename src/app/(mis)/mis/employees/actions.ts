'use server';
import { revalidatePath } from 'next/cache';
import { createEmployee, updateEmployee, deleteEmployee, restoreEmployee } from '@/server/mis/employee';

export async function saveEmployeeAction(id: string | null, values: any) {
  if (id) { await updateEmployee(id, values); } else { await createEmployee(values); }
  revalidatePath('/mis/employees');
}
export async function deleteEmployeeAction(id: string) { await deleteEmployee(id); revalidatePath('/mis/employees'); }
export async function restoreEmployeeAction(id: string) { await restoreEmployee(id); revalidatePath('/mis/employees'); }
