import sharp from 'sharp';

import { db } from '@/server/db';
import { getObject, putObject } from '@/server/storage';

import { logAuditEvent } from './audit';
import { requirePermission } from './auth';
import { authenticateDevice } from './kiosk-device';

/**
 * V2 Epic 7 — the face on the badge.
 *
 * One photo per employee, normalised on the way in to a 256×256 WebP (a few KB, square, no EXIF)
 * and stored under a key derived from the employee id, so the row only needs to remember the
 * portal URL. The same bytes are served to a signed-in reader (`employees.read`) and to a paired
 * gate tablet (device token, D18) — two doors, one object.
 */

export const PHOTO_SIZE = 256;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const photoKey = (employeeId: string) => `mis/employees/${employeeId}/photo.webp`;
/** `v=` changes on every retake so a browser or tablet that cached the old face fetches the new one. */
const photoUrlFor = (employeeId: string) => `/api/mis/employees/${employeeId}/photo?v=${Date.now()}`;

/** Resize + convert. Exported for the test; never called without a gate in front of it. */
export async function normalisePhoto(bytes: Uint8Array): Promise<Buffer> {
  return sharp(bytes).rotate().resize(PHOTO_SIZE, PHOTO_SIZE, { fit: 'cover', position: 'attention' }).webp({ quality: 80 }).toBuffer();
}

export async function setEmployeePhoto(employeeId: string, bytes: Uint8Array, mimeType: string): Promise<{ photoUrl: string }> {
  const actor = await requirePermission('employees.write');
  if (!mimeType.startsWith('image/')) throw new Error('Upload an image (JPEG, PNG or WebP).');
  if (bytes.byteLength === 0) throw new Error('The photo is empty.');
  if (bytes.byteLength > MAX_PHOTO_BYTES) throw new Error('The photo is over 5 MB — take a smaller one.');
  const employee = await db.misEmployee.findUnique({ where: { id: employeeId }, select: { id: true, deletedAt: true } });
  if (!employee || employee.deletedAt) throw new Error('Employee not found');

  const webp = await normalisePhoto(bytes);
  await putObject(photoKey(employeeId), webp, 'image/webp');
  const photoUrl = photoUrlFor(employeeId);
  await db.misEmployee.update({ where: { id: employeeId }, data: { photoUrl } });
  await logAuditEvent({ actorId: actor.userId, action: 'employee.photo.set', entity: 'MisEmployee', entityId: employeeId, after: { photoUrl, bytes: webp.byteLength } });
  return { photoUrl };
}

async function readPhoto(employeeId: string): Promise<Uint8Array | null> {
  const employee = await db.misEmployee.findUnique({ where: { id: employeeId }, select: { photoUrl: true } });
  if (!employee?.photoUrl) return null;
  try {
    return (await getObject(photoKey(employeeId))).bytes;
  } catch {
    return null; // the row says there is one but storage disagrees — the kiosk shows initials, not an error
  }
}

/** A signed-in reader's copy. */
export async function getEmployeePhoto(employeeId: string): Promise<Uint8Array | null> {
  await requirePermission('employees.read');
  return readPhoto(employeeId);
}

/** A paired tablet's copy: device-token door (D18), like `pullForDevice`. */
export async function getEmployeePhotoForDevice(authorizationHeader: string | null | undefined, employeeId: string): Promise<Uint8Array | null> {
  await authenticateDevice(authorizationHeader);
  return readPhoto(employeeId);
}
