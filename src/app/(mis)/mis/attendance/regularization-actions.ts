'use server';
import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import {
  decidePunchRegularization,
  submitPunchRegularization,
  withdrawPunchRegularization,
} from '@/server/mis/punch-regularization';

// R2-222: every export returns an ActionResult so a refusal reaches the screen as text.

export async function submitPunchRegularizationAction(input: {
  employeeId: string; workDate: string; requestedIn?: string | null; requestedOut?: string | null; reason: string;
}) {
  return asResult(async () => {
    await submitPunchRegularization(input);
    revalidatePath('/mis/me/regularization');
    revalidatePath('/mis/attendance/regularization');
  });
}
export async function withdrawPunchRegularizationAction(id: string) {
  return asResult(async () => {
    await withdrawPunchRegularization(id);
    revalidatePath('/mis/me/regularization');
    revalidatePath('/mis/attendance/regularization');
  });
}
export async function decidePunchRegularizationAction(id: string, approve: boolean, note?: string) {
  return asResult(async () => {
    await decidePunchRegularization(id, approve, note);
    revalidatePath('/mis/attendance');
    revalidatePath('/mis/attendance/regularization');
    revalidatePath('/mis/me/regularization');
  });
}
