'use server';

import { revalidatePath } from 'next/cache';

import type { MisExtraPayKind, MisExtraPayScope } from '@/generated/prisma/enums';
import { asResult } from '@/lib/mis/action-result';
import { proposeExtraPayDay } from '@/server/mis/extra-pay-days';

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
