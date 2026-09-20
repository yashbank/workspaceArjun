'use server';

import { revalidatePath } from 'next/cache';
import { MisDefectSeverity } from '@/generated/prisma/enums';
import { createDefectType, deleteDefectType, restoreDefectType, updateDefectType } from '@/server/mis/defect-type';

export async function saveDefectTypeAction(
  id: string | null,
  values: { code: string; name: string; nameHi?: string; severity: MisDefectSeverity; sortOrder: number },
) {
  if (id) {
    await updateDefectType(id, values);
  } else {
    await createDefectType(values);
  }
  revalidatePath('/mis/masters/defect-types');
}

export async function deleteDefectTypeAction(id: string) {
  await deleteDefectType(id);
  revalidatePath('/mis/masters/defect-types');
}

export async function restoreDefectTypeAction(id: string) {
  await restoreDefectType(id);
  revalidatePath('/mis/masters/defect-types');
}
