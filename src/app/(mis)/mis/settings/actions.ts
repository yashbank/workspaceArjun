'use server';
import { updateBusinessRule } from '@/server/mis/business-rules';
import { revalidatePath } from 'next/cache';

export async function updateRuleAction(ruleKey: string, ruleValue: string) {
  await updateBusinessRule(ruleKey, ruleValue);
  revalidatePath('/mis/settings');
}
