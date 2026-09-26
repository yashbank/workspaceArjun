'use server';

import { revalidatePath } from 'next/cache';

import type { MisExtraPayKind, MisExtraPayScope } from '@/generated/prisma/enums';
import { proposeExtraPayDay } from '@/server/mis/extra-pay-days';

/** Admin or Super Attendance Operator (attendance.write) — D28. Owner approval happens on /mis/approvals. */
export async function proposeExtraPayDayAction(input: {
  date: string;
  kind: MisExtraPayKind;
  value: number;
  scope: MisExtraPayScope;
  employeeIds?: string[];
  reason: string;
}) {
  await proposeExtraPayDay({ ...input, date: new Date(input.date) });
  revalidatePath('/mis/attendance/extra-pay');
  revalidatePath('/mis/approvals');
}
