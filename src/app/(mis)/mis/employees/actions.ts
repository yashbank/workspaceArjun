'use server';
import { revalidatePath } from 'next/cache';
import { createEmployee, updateEmployee, deleteEmployee, restoreEmployee, setEmployeeActive, importEmployeesCsv, type EmployeeInput, type EmployeeCsvRow } from '@/server/mis/employee';
import { setEmployeePhoto } from '@/server/mis/employee-photo';
import { asResult } from '@/lib/mis/action-result';

export async function saveEmployeeAction(id: string | null, values: EmployeeInput) {
  return asResult(async () => {
    const saved = id ? await updateEmployee(id, values) : await createEmployee(values);
    revalidatePath('/mis/employees');
    return { id: saved.id };
  }, { entity: 'Employee', fields: values });
}

/** V2 Epic 7 — `formData` carries one `photo` file; resized to 256×256 WebP on the server. */
export async function uploadEmployeePhotoAction(id: string, formData: FormData) {
  return asResult(async () => {
    const file = formData.get('photo');
    if (!(file instanceof File)) throw new Error('No photo was attached.');
    await setEmployeePhoto(id, new Uint8Array(await file.arrayBuffer()), file.type);
    revalidatePath('/mis/employees');
    revalidatePath(`/mis/employees/${id}`);
    revalidatePath('/mis/kiosk');
  });
}
export async function importEmployeesCsvAction(rows: EmployeeCsvRow[]) {
  return asResult(async () => {
    const summary = await importEmployeesCsv(rows);
    revalidatePath('/mis/employees');
    return summary;
  });
}
export async function deleteEmployeeAction(id: string) {
  return asResult(async () => { await deleteEmployee(id); revalidatePath('/mis/employees'); }, { entity: 'Employee' });
}
export async function restoreEmployeeAction(id: string) {
  return asResult(async () => { await restoreEmployee(id); revalidatePath('/mis/employees'); }, { entity: 'Employee' });
}
export async function setEmployeeActiveAction(id: string, isActive: boolean) {
  return asResult(async () => { await setEmployeeActive(id, isActive); revalidatePath('/mis/employees'); }, { entity: 'Employee' });
}
