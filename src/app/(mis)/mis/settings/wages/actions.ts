'use server';

import { revalidatePath } from 'next/cache';

import { asResult } from '@/lib/mis/action-result';
import type { MisPayBasis, MisWageUnit } from '@/generated/prisma/enums';
import { addWageRate, createWageType, setWageTypeActive, updateWageTypeDetails } from '@/server/mis/wage-type';

export async function createWageTypeAction(input: {
  name: string;
  nameHi?: string;
  unit: MisWageUnit;
  amount: number;
  otRatePerHour?: number | null;
  multiplierBasis?: MisPayBasis;
  hraAmount?: number | null;
  allowanceAmount?: number | null;
  bonusAmount?: number | null;
}) {
  return asResult(async () => {
    await createWageType(input);
    revalidatePath('/mis/settings/wages');
  }, { entity: 'Wage type', fields: input });
}

export async function addWageRateAction(
  code: string,
  amount: number,
  effectiveFrom?: string,
  extra?: {
    otRatePerHour?: number | null;
    multiplierBasis?: MisPayBasis;
    hraAmount?: number | null;
    allowanceAmount?: number | null;
    bonusAmount?: number | null;
  },
) {
  return asResult(async () => {
    await addWageRate(code, amount, effectiveFrom ? new Date(effectiveFrom) : undefined, extra);
    revalidatePath('/mis/settings/wages');
  }, { entity: 'Wage rate' });
}

export async function setWageTypeActiveAction(code: string, isActive: boolean) {
  return asResult(async () => {
    await setWageTypeActive(code, isActive);
    revalidatePath('/mis/settings/wages');
  }, { entity: 'Wage type' });
}

/** R2-114: rename a wage type (name / Hindi name) — labels only, never a rate. Owner only (server-gated). */
export async function updateWageTypeDetailsAction(code: string, input: { name: string; nameHi?: string | null }) {
  return asResult(async () => {
    await updateWageTypeDetails(code, input);
    revalidatePath('/mis/settings/wages');
  }, { entity: 'Wage type' });
}
