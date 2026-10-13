'use server';
import { asResult } from '@/lib/mis/action-result';
import { updateBusinessRule } from '@/server/mis/business-rules';
import { revalidatePath } from 'next/cache';

export async function updateRuleAction(ruleKey: string, ruleValue: string) {
  return asResult(async () => {
    await updateBusinessRule(ruleKey, ruleValue);
    revalidatePath('/mis/settings');
  }, { entity: 'Rule' });
}
