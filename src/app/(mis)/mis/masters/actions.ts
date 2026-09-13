'use server';

import { revalidatePath } from 'next/cache';

import {
  addOptionInline,
  createOption,
  deleteOption,
  restoreOption,
  updateOption,
} from '@/server/mis/master-option';

/**
 * Server actions for the option masters.
 *
 * Thin on purpose: every check and every audit write lives in
 * server/mis/master-option.ts, which each of these calls. A server action is a
 * public endpoint, so none of them re-implements a permission decision here.
 */

export async function saveOptionAction(
  group: string,
  id: string | null,
  values: { label: string; labelHi?: string },
) {
  if (id) {
    await updateOption(id, { label: values.label, labelHi: values.labelHi ?? null });
  } else {
    await createOption({ group, label: values.label, labelHi: values.labelHi ?? null });
  }
  revalidatePath(`/mis/masters/${group}`);
}

export async function deleteOptionAction(group: string, id: string) {
  await deleteOption(id);
  revalidatePath(`/mis/masters/${group}`);
}

export async function restoreOptionAction(group: string, id: string) {
  await restoreOption(id);
  revalidatePath(`/mis/masters/${group}`);
}

export async function addOptionInlineAction(group: string, label: string) {
  const value = await addOptionInline(group, label);
  revalidatePath(`/mis/masters/${group}`);
  return value;
}
