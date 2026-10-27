'use server';

import { revalidatePath } from 'next/cache';

import type { MisExtraPayKind, MisExtraPayScope } from '@/generated/prisma/enums';
import { asResult } from '@/lib/mis/action-result';
import { proposeExtraPayDay, withdrawExtraPayProposal } from '@/server/mis/extra-pay-days';

/** Admin or Super Attendance Operator (attendance.write) — D28. Owner approval happens on /mis/approvals. */
export async function proposeExtraPayDayAction(input: {
  date: string;
  kind: MisExtraPayKind;
  value: number;
  scope: MisExtraPayScope;
  employeeIds?: string[];
  departmentIds?: string[];
  reason: string;
}) {
  return asResult(async () => {
    // The date stays a YYYY-MM-DD string: the server validates and normalises it (R3 B45).
    await proposeExtraPayDay(input);
    revalidatePath('/mis/attendance/extra-pay');
    revalidatePath('/mis/approvals');
  }, { entity: 'Extra-pay day' });
}

/** R2-169: the proposer withdraws their own PENDING proposal. */
export async function withdrawExtraPayProposalAction(id: string) {
  return asResult(async () => {
    await withdrawExtraPayProposal(id);
    revalidatePath('/mis/attendance/extra-pay');
    revalidatePath('/mis/approvals');
  }, { entity: 'Extra-pay day' });
}
