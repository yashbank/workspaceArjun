'use server';

import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import { setLeavePay } from '@/server/mis/leave-pay';

/** R2-102: mark one leave type PAID or UNPAID from today. Owner only (server-gated, wages.read). */
export async function setLeavePayAction(input: { leaveType: string; paid: boolean; reason?: string }) {
  return asResult(async () => {
    await setLeavePay(input);
    revalidatePath('/mis/settings/leave-pay');
    revalidatePath('/mis/payroll');
  }, { entity: 'Leave pay' });
}
