'use server';

import { asResult, type ActionResult } from '@/lib/mis/action-result';
import { changeOwnEmail, changeOwnPassword, type OwnEmailResult } from '@/server/mis/account';

export async function changeOwnPasswordAction(
  current: string,
  next: string,
  confirm: string,
): Promise<ActionResult> {
  return asResult(() => changeOwnPassword(current, next, confirm), { entity: 'Password' });
}

export async function changeOwnEmailAction(email: string): Promise<ActionResult<OwnEmailResult>> {
  return asResult(() => changeOwnEmail(email), { entity: 'Email' });
}
