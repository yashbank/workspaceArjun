'use server';
import { revalidatePath } from 'next/cache';
import { createEmployee, updateEmployee, deleteEmployee, restoreEmployee, type EmployeeInput } from '@/server/mis/employee';
import { setEmployeePhoto } from '@/server/mis/employee-photo';

export async function saveEmployeeAction(id: string | null, values: EmployeeInput): Promise<{ id: string }> {
  const saved = id ? await updateEmployee(id, values) : await createEmployee(values);
  revalidatePath('/mis/employees');
  return { id: saved.id };
}

/** V2 Epic 7 — `formData` carries one `photo` file; resized to 256×256 WebP on the server. */
export async function uploadEmployeePhotoAction(id: string, formData: FormData) {
  const file = formData.get('photo');
  if (!(file instanceof File)) throw new Error('No photo was attached.');
  await setEmployeePhoto(id, new Uint8Array(await file.arrayBuffer()), file.type);
  revalidatePath('/mis/employees');
  revalidatePath(`/mis/employees/${id}`);
  revalidatePath('/mis/kiosk');
}
export async function deleteEmployeeAction(id: string) { await deleteEmployee(id); revalidatePath('/mis/employees'); }
export async function restoreEmployeeAction(id: string) { await restoreEmployee(id); revalidatePath('/mis/employees'); }
