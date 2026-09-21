'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { scheduleBusinessRule } from '@/server/mis/business-rules';

/**
 * The form action behind D12's "Schedule change". Thin on purpose: `scheduleBusinessRule` holds the Owner gate, the
 * validation and the audit row. A failure is handed back with what was typed so the form is not blanked; the page
 * to return to is fixed here, never taken from the form. `redirect()` throws, so it is OUTSIDE the try/catch.
 */

export type ScheduleState = { error: string | null; values?: { ruleValue: string; effectiveFrom: string; reason: string } };

const PAGE = '/mis/settings/rules';

export async function scheduleRuleAction(_previous: ScheduleState, formData: FormData): Promise<ScheduleState> {
  const ruleKey = String(formData.get('ruleKey') ?? '');
  const ruleValue = String(formData.get('ruleValue') ?? '');
  const effectiveFrom = String(formData.get('effectiveFrom') ?? '');
  const reason = String(formData.get('reason') ?? '');
  const values = { ruleValue, effectiveFrom, reason };
  if (!ruleKey) return { error: 'Choose a rule to change.', values };

  try {
    await scheduleBusinessRule({ ruleKey, ruleValue, effectiveFrom, reason });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not schedule the change', values };
  }
  revalidatePath(PAGE);
  revalidatePath('/mis/settings');
  redirect(`${PAGE}?rule=${encodeURIComponent(ruleKey)}&scheduled=1`);
}
