'use server';
import { revalidatePath } from 'next/cache';

import { createQcTemplate, seedQcTemplates, setQcTemplateActive, updateQcTemplate, type QcTemplateInput } from '@/server/mis/qc-template';

const PATH = '/mis/settings/qc-templates';

export async function createQcTemplateAction(input: QcTemplateInput) {
  await createQcTemplate(input);
  revalidatePath(PATH);
}
export async function updateQcTemplateAction(id: string, input: QcTemplateInput) {
  await updateQcTemplate(id, input);
  revalidatePath(PATH);
}
export async function setQcTemplateActiveAction(id: string, isActive: boolean) {
  await setQcTemplateActive(id, isActive);
  revalidatePath(PATH);
}
export async function seedQcTemplatesAction() {
  const r = await seedQcTemplates();
  revalidatePath(PATH);
  return r;
}
