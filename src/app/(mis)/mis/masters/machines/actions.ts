'use server';
import { revalidatePath } from 'next/cache';
import { createMachine, updateMachine, deleteMachine, restoreMachine, type MachineInput } from '@/server/mis/machine';

export async function saveMachineAction(id: string | null, values: MachineInput) {
  if (id) { await updateMachine(id, values); } else { await createMachine(values); }
  revalidatePath('/mis/masters/machines');
}
export async function deleteMachineAction(id: string) { await deleteMachine(id); revalidatePath('/mis/masters/machines'); }
export async function restoreMachineAction(id: string) { await restoreMachine(id); revalidatePath('/mis/masters/machines'); }
