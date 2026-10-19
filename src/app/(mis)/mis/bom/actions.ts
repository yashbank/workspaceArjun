'use server';
import {
  createBom,
  addBomStage,
  addBomMaterial,
  submitBomForApproval,
  approveBom,
  rejectBom,
  deleteBom,
  deleteBomStage,
  deleteBomMaterial,
  reorderBomStages,
  updateBomStage,
  updateBomMaterial,
} from '@/server/mis/bom';
import { revalidatePath } from 'next/cache';
import { asResult, type ActionResult } from '@/lib/mis/action-result';

export async function createBomAction(orderId: string): Promise<ActionResult> {
  return asResult(async () => {
    await createBom(orderId);
    revalidatePath('/mis/orders');
    revalidatePath('/mis/bom', 'layout');
  });
}
export async function addStageAction(bomId: string, data: { stageName: string; processId?: string; seq: number }): Promise<ActionResult> {
  return asResult(async () => {
    await addBomStage(bomId, data);
    revalidatePath('/mis/bom', 'layout');
  });
}
export async function reorderStagesAction(bomId: string, stageIdsInOrder: string[]): Promise<ActionResult> {
  return asResult(async () => {
    await reorderBomStages(bomId, stageIdsInOrder);
    revalidatePath('/mis/bom', 'layout');
  });
}
export async function addMaterialAction(stageId: string, data: { description: string; itemId?: string; quantity: number; unit: string; ratePerUnit?: number; seq: number }): Promise<ActionResult> {
  return asResult(async () => {
    await addBomMaterial(stageId, data);
    revalidatePath('/mis/bom', 'layout');
  });
}
export async function deleteMaterialAction(materialId: string): Promise<ActionResult> {
  return asResult(async () => {
    await deleteBomMaterial(materialId);
    revalidatePath('/mis/bom', 'layout');
  });
}
export async function submitBomAction(bomId: string): Promise<ActionResult> {
  return asResult(async () => {
    await submitBomForApproval(bomId);
    revalidatePath('/mis/bom', 'layout');
  });
}
export async function approveBomAction(bomId: string): Promise<ActionResult> {
  return asResult(async () => {
    await approveBom(bomId);
    revalidatePath('/mis/bom', 'layout');
  });
}
export async function rejectBomAction(orderId: string, reason: string): Promise<ActionResult> {
  return asResult(async () => {
    await rejectBom(orderId, reason);
    revalidatePath('/mis/bom', 'layout');
    revalidatePath('/mis/approvals');
  });
}
export async function deleteBomAction(orderId: string): Promise<ActionResult> {
  return asResult(async () => {
    await deleteBom(orderId);
    revalidatePath('/mis/orders');
    revalidatePath('/mis/bom', 'layout');
  });
}
export async function deleteStageAction(stageId: string): Promise<ActionResult> {
  return asResult(async () => {
    await deleteBomStage(stageId);
    revalidatePath('/mis/bom', 'layout');
  });
}
export async function updateStageAction(stageId: string, patch: { stageName?: string; notes?: string | null; seq?: number; processId?: string | null }): Promise<ActionResult> {
  return asResult(async () => {
    await updateBomStage(stageId, patch);
    revalidatePath('/mis/bom', 'layout');
  });
}
export async function updateMaterialAction(
  materialId: string,
  patch: { description?: string; quantity?: number; unit?: string; seq?: number; ratePerUnit?: number | null; itemId?: string | null },
): Promise<ActionResult> {
  return asResult(async () => {
    await updateBomMaterial(materialId, patch);
    revalidatePath('/mis/bom', 'layout');
  });
}
