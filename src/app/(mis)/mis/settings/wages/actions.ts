'use server';

import { revalidatePath } from 'next/cache';

import type { MisPayBasis, MisWageUnit } from '@/generated/prisma/enums';
import { addWageRate, createWageType, setWageTypeActive } from '@/server/mis/wage-type';

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
  await createWageType(input);
  revalidatePath('/mis/settings/wages');
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
  await addWageRate(code, amount, effectiveFrom ? new Date(effectiveFrom) : undefined, extra);
  revalidatePath('/mis/settings/wages');
}

export async function setWageTypeActiveAction(code: string, isActive: boolean) {
  await setWageTypeActive(code, isActive);
  revalidatePath('/mis/settings/wages');
}
