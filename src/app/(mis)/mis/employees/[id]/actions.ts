'use server';

import { revalidatePath } from 'next/cache';

import type { MisPayComponent } from '@/generated/prisma/enums';
import { setPayComponent } from '@/server/mis/pay-components';

/** Owner only (the server function gates it) — toggles one payslip row for one employee (25.1). */
export async function setPayComponentAction(employeeId: string, component: MisPayComponent, enabled: boolean) {
  await setPayComponent(employeeId, component, enabled);
  revalidatePath(`/mis/employees/${employeeId}`);
}
