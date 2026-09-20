'use server';

import { revalidatePath } from 'next/cache';

import type { MisWageUnit } from '@/generated/prisma/enums';
import { addWageRate, createWageType, setWageTypeActive } from '@/server/mis/wage-type';

export async function createWageTypeAction(input: {
  name: string;
  nameHi?: string;
  unit: MisWageUnit;
  amount: number;
}) {
  await createWageType(input);
  revalidatePath('/mis/settings/wages');
}

export async function addWageRateAction(code: string, amount: number, effectiveFrom?: string) {
  await addWageRate(code, amount, effectiveFrom ? new Date(effectiveFrom) : undefined);
  revalidatePath('/mis/settings/wages');
}

export async function setWageTypeActiveAction(code: string, isActive: boolean) {
  await setWageTypeActive(code, isActive);
  revalidatePath('/mis/settings/wages');
}
