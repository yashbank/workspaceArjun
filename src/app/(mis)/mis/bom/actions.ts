'use server';
import {
  createBom,
  addBomStage,
  addBomMaterial,
  submitBomForApproval,
  approveBom,
  deleteBomStage,
  deleteBomMaterial,
  reorderBomStages,
} from '@/server/mis/bom';
import { revalidatePath } from 'next/cache';

export async function createBomAction(orderId: string) {
  await createBom(orderId);
  revalidatePath('/mis/orders');
  revalidatePath('/mis/bom', 'layout');
}
export async function addStageAction(bomId: string, data: { stageName: string; processId?: string; seq: number }) {
  await addBomStage(bomId, data);
  revalidatePath('/mis/bom', 'layout');
}
export async function reorderStagesAction(bomId: string, stageIdsInOrder: string[]) {
  await reorderBomStages(bomId, stageIdsInOrder);
  revalidatePath('/mis/bom', 'layout');
}
export async function addMaterialAction(stageId: string, data: { description: string; itemId?: string; quantity: number; unit: string; ratePerUnit?: number; seq: number }) {
  await addBomMaterial(stageId, data);
  revalidatePath('/mis/bom', 'layout');
}
export async function deleteMaterialAction(materialId: string) {
  await deleteBomMaterial(materialId);
  revalidatePath('/mis/bom', 'layout');
}
export async function submitBomAction(bomId: string) {
  await submitBomForApproval(bomId);
  revalidatePath('/mis/bom', 'layout');
}
export async function approveBomAction(bomId: string) {
  await approveBom(bomId);
  revalidatePath('/mis/bom', 'layout');
}
export async function deleteStageAction(stageId: string) {
  await deleteBomStage(stageId);
  revalidatePath('/mis/bom', 'layout');
}
