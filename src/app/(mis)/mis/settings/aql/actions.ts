'use server';
import { updateAqlThreshold } from '@/server/mis/business-rules';
import { revalidatePath } from 'next/cache';

export async function updateAqlThresholdAction(ruleKey: string, ruleValue: string) {
  await updateAqlThreshold(ruleKey, ruleValue);
  revalidatePath('/mis/settings/aql');
}
