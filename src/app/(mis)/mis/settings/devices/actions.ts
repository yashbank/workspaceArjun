'use server';

import { revalidatePath } from 'next/cache';

import { isMisForbiddenError } from '@/server/mis/auth';
import {
  approveEnrolment,
  KioskDeviceError,
  renameDevice,
  revokeDevice,
} from '@/server/mis/kiosk-device';

/**
 * Outcomes are returned as values, not thrown: React replaces a thrown
 * server-action error with a generic message in production builds, so
 * "That code has expired" would never reach the Admin who needs to read it
 * (the Phase 11 lesson). Only errors written for a person become an outcome;
 * anything unexpected stays an exception rather than leaking internals.
 */
export type DeviceActionResult<T = object> = ({ ok: true } & T) | { ok: false; detail: string };

async function outcome<T extends object>(run: () => Promise<T>): Promise<DeviceActionResult<T>> {
  try {
    const value = await run();
    revalidatePath('/mis/settings/devices');
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof KioskDeviceError) return { ok: false, detail: error.message };
    if (isMisForbiddenError(error)) return { ok: false, detail: 'Only an Owner or Admin can manage gate tablets.' };
    throw error;
  }
}

export async function approveEnrolmentAction(code: string, name: string) {
  return outcome(async () => {
    const device = await approveEnrolment({ code, name });
    return { name: device.name };
  });
}

export async function revokeDeviceAction(id: string, reason: string) {
  return outcome(() => revokeDevice(id, reason));
}

export async function renameDeviceAction(id: string, name: string) {
  return outcome(() => renameDevice(id, name));
}
