import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import type { MisKioskDeviceStatus } from '@/generated/prisma/enums';
import {
  cacheLevel,
  syncLevel,
  worstLevel,
  type KioskHealthLevel,
} from '@/lib/mis/kiosk-health';
import { dateKeyToDbDate, factoryDateKey } from '@/lib/mis/factory-time';
import { db } from '@/server/db';

import { logAuditEvent } from './audit';
import { requirePermission } from './auth';
import { getFactoryTimezone } from './business-rules';

/**
 * Gate-tablet enrolment, identity and the employee pull (Phase 12, MIS-243).
 * Decisions: D18 (how a tablet is enrolled and who may do it), D19 (what it may
 * pull and what "stale" means). Designs: K10, K12.
 *
 * TWO KINDS OF CALLER, TWO KINDS OF GATE. Everything an Admin does opens with
 * `requirePermission('kiosk.manage')` like every other MIS module. Everything a
 * *tablet* does has no user and no session, so it opens with a device credential
 * check instead — `authenticateDevice` for the token, or the poll secret inside
 * `claimEnrolment`. Both are rejected before any data is read. The one exception
 * that cannot have a credential is `requestEnrolment`, because the tablet has
 * nothing yet: it reads nothing, returns only its own new code, and is capped.
 *
 * SECRETS ARE NEVER STORED, LOGGED OR RETURNED TWICE. The poll secret and the
 * bearer token are 256-bit random values; only their SHA-256 is kept, so a read
 * of the table cannot be replayed as a device. The token leaves this module
 * exactly once, from `claimEnrolment`. No audit payload, error message or return
 * value elsewhere contains either.
 */

/** D18 — how long a pairing code lives. K10: "long enough to walk to the office". */
export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
/**
 * D18 — the unauthenticated pairing request is capped so it cannot fill the table.
 * Trade-off, accepted: someone who fills the cap can delay a real enrolment by up
 * to a code lifetime; they cannot enrol anything.
 */
export const MAX_PENDING_ENROLMENTS = 20;

// No 0/O/1/I/L: a code read off a tablet and typed by a person must not be misread.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 7;
const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

const TOKEN_PATTERN = /^mkd_[A-Za-z0-9_-]{43}$/;
const POLL_SECRET_PATTERN = /^mks_[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_NAME_LENGTH = 40;
const MAX_HARDWARE_LABEL_LENGTH = 80;
const MAX_REVOKE_REASON_LENGTH = 200;

export type KioskErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'CODE_INVALID'
  | 'NAME_TAKEN'
  | 'TOO_MANY_PENDING'
  | 'UNAUTHORIZED'
  | 'REVOKED';

/**
 * A refusal the caller can act on. The message is written for a person; the code
 * is what a route maps to an HTTP status. `UNAUTHORIZED` is deliberately generic —
 * it never says whether the token, the secret or the device id was the wrong one.
 */
export class KioskDeviceError extends Error {
  readonly code: KioskErrorCode;
  constructor(code: KioskErrorCode, message: string) {
    super(message);
    this.name = 'KioskDeviceError';
    this.code = code;
  }
}

export function kioskErrorStatus(code: KioskErrorCode): number {
  switch (code) {
    case 'UNAUTHORIZED':
    case 'REVOKED':
      return 401;
    case 'NOT_FOUND':
      return 404;
    case 'NAME_TAKEN':
      return 409;
    case 'TOO_MANY_PENDING':
      return 429;
    default:
      return 400;
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function newSecret(prefix: 'mkd_' | 'mks_'): string {
  return prefix + randomBytes(32).toString('base64url');
}

function newPairingCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** "4K7P92" → "4K7P-92": the shape K10 shows. The stored form has no dash. */
export function formatPairingCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** What an Admin typed → the stored form, or null when it cannot be a code. */
export function normalisePairingCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CODE_PATTERN.test(cleaned) ? cleaned : null;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002';
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

// ---------------------------------------------------------------------------
// The device's own report of how it is (K12)
// ---------------------------------------------------------------------------

export type DeviceHealthReport = {
  appVersion?: string;
  batteryPercent?: number;
  isCharging?: boolean;
  queuedPunches?: number;
};

/**
 * Take only what is plainly valid from a device's self-report and drop the rest.
 * The report is informational — a tablet with a bad battery sensor must not be
 * able to fail its own sync, or write arbitrary text into the portal.
 */
export function parseHealthReport(input: unknown): DeviceHealthReport {
  if (!input || typeof input !== 'object') return {};
  const raw = input as Record<string, unknown>;
  const out: DeviceHealthReport = {};
  if (typeof raw.appVersion === 'string' && /^[\w.+-]{1,32}$/.test(raw.appVersion)) out.appVersion = raw.appVersion;
  if (Number.isInteger(raw.batteryPercent) && (raw.batteryPercent as number) >= 0 && (raw.batteryPercent as number) <= 100) {
    out.batteryPercent = raw.batteryPercent as number;
  }
  if (typeof raw.isCharging === 'boolean') out.isCharging = raw.isCharging;
  if (Number.isInteger(raw.queuedPunches) && (raw.queuedPunches as number) >= 0 && (raw.queuedPunches as number) <= 1_000_000) {
    out.queuedPunches = raw.queuedPunches as number;
  }
  return out;
}

function healthColumns(health: DeviceHealthReport, now: Date) {
  const present = Object.keys(health).length > 0;
  return {
    ...(health.appVersion !== undefined ? { appVersion: health.appVersion } : {}),
    ...(health.batteryPercent !== undefined ? { batteryPercent: health.batteryPercent } : {}),
    ...(health.isCharging !== undefined ? { isCharging: health.isCharging } : {}),
    ...(health.queuedPunches !== undefined ? { queuedPunches: health.queuedPunches } : {}),
    ...(present ? { healthReportedAt: now } : {}),
  };
}

// ---------------------------------------------------------------------------
// Admin side — every function opens with requirePermission('kiosk.manage')
// ---------------------------------------------------------------------------

export type ApprovedDevice = { id: string; name: string; hardwareLabel: string | null };

/**
 * An Admin types the code a tablet is showing and names the tablet (K10). The
 * tablet does not learn anything from this call — it collects its token on its
 * next poll (`claimEnrolment`), so the Admin never sees or handles a credential.
 */
export async function approveEnrolment(input: { code: unknown; name: unknown }): Promise<ApprovedDevice> {
  const actor = await requirePermission('kiosk.manage');

  const code = normalisePairingCode(input.code);
  if (!code) throw new KioskDeviceError('CODE_INVALID', 'That is not a valid pairing code. It looks like 4K7P-92.');

  const name = cleanText(input.name, MAX_NAME_LENGTH);
  if (!name) throw new KioskDeviceError('BAD_REQUEST', 'Give the tablet a name, like GATE-01.');

  const now = new Date();
  const pending = await db.misKioskDevice.findFirst({
    where: { status: 'PENDING', pairingCode: code, pairingExpiresAt: { gt: now } },
    select: { id: true, hardwareLabel: true },
  });
  if (!pending) {
    throw new KioskDeviceError('CODE_INVALID', 'That code is not valid or has expired. Ask for a new one on the tablet.');
  }

  let claimed: { count: number };
  try {
    claimed = await db.misKioskDevice.updateMany({
      // `status: 'PENDING'` in the filter is the race guard: two Admins typing the
      // same code cannot both approve it — one update matches, the other matches nothing.
      where: { id: pending.id, status: 'PENDING' },
      data: {
        status: 'ACTIVE',
        name,
        approvedById: actor.userId,
        approvedAt: now,
        pairingCode: null,
        pairingExpiresAt: null,
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new KioskDeviceError('NAME_TAKEN', `A tablet is already named ${name}. Pick another name.`);
    }
    throw error;
  }
  if (claimed.count !== 1) {
    throw new KioskDeviceError('CODE_INVALID', 'That code was already used. Ask for a new one on the tablet.');
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: 'kiosk.approve',
    entity: 'MisKioskDevice',
    entityId: pending.id,
    after: { name, hardwareLabel: pending.hardwareLabel },
  });
  return { id: pending.id, name, hardwareLabel: pending.hardwareLabel };
}

/**
 * Retire a tablet. The token stops working on the very next request (every
 * authenticated call reads the row), and the tablet is told to wipe its list
 * (K10). The row is kept: its history stays, and Phase 13 still accepts punches
 * it had queued — they are real events (D18).
 */
export async function revokeDevice(id: string, reason?: string): Promise<{ id: string; alreadyRevoked: boolean }> {
  const actor = await requirePermission('kiosk.manage');
  if (!UUID_PATTERN.test(id)) throw new KioskDeviceError('NOT_FOUND', 'Device not found.');

  const device = await db.misKioskDevice.findUnique({
    where: { id },
    select: { id: true, status: true, name: true },
  });
  if (!device) throw new KioskDeviceError('NOT_FOUND', 'Device not found.');
  if (device.status === 'REVOKED') return { id, alreadyRevoked: true };

  const cleanReason = cleanText(reason, MAX_REVOKE_REASON_LENGTH);
  await db.misKioskDevice.update({
    where: { id },
    data: {
      status: 'REVOKED',
      revokedById: actor.userId,
      revokedAt: new Date(),
      revokedReason: cleanReason,
      // A revoked row keeps its token hash (so its queued punches can still be
      // attributed) but never a pairing code — a spent code must not stay live.
      pairingCode: null,
      pairingExpiresAt: null,
    },
  });
  await logAuditEvent({
    actorId: actor.userId,
    action: 'kiosk.revoke',
    entity: 'MisKioskDevice',
    entityId: id,
    before: { status: device.status, name: device.name },
    after: { status: 'REVOKED', reason: cleanReason },
  });
  return { id, alreadyRevoked: false };
}

export async function renameDevice(id: string, name: unknown): Promise<{ id: string; name: string }> {
  const actor = await requirePermission('kiosk.manage');
  if (!UUID_PATTERN.test(id)) throw new KioskDeviceError('NOT_FOUND', 'Device not found.');
  const clean = cleanText(name, MAX_NAME_LENGTH);
  if (!clean) throw new KioskDeviceError('BAD_REQUEST', 'Give the tablet a name, like GATE-01.');

  const before = await db.misKioskDevice.findUnique({ where: { id }, select: { id: true, status: true, name: true } });
  if (!before || before.status !== 'ACTIVE') throw new KioskDeviceError('NOT_FOUND', 'Device not found.');

  try {
    await db.misKioskDevice.update({ where: { id }, data: { name: clean } });
  } catch (error) {
    if (isUniqueViolation(error)) throw new KioskDeviceError('NAME_TAKEN', `A tablet is already named ${clean}.`);
    throw error;
  }
  await logAuditEvent({
    actorId: actor.userId,
    action: 'kiosk.rename',
    entity: 'MisKioskDevice',
    entityId: id,
    before: { name: before.name },
    after: { name: clean },
  });
  return { id, name: clean };
}

export type KioskDeviceRow = {
  id: string;
  name: string;
  status: Exclude<MisKioskDeviceStatus, 'PENDING'>;
  hardwareLabel: string | null;
  approvedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  lastSyncAt: Date | null;
  lastPullAt: Date | null;
  appVersion: string | null;
  batteryPercent: number | null;
  isCharging: boolean | null;
  queuedPunches: number | null;
  syncLevel: KioskHealthLevel;
  cacheLevel: KioskHealthLevel;
};

/**
 * Every enrolled and retired tablet with its health. PENDING rows are omitted:
 * they are unnamed, unauthenticated requests and an Admin reaches one by typing
 * its code, not by browsing a list of strangers. No hash is ever selected.
 */
export async function listDevices(now: Date = new Date()): Promise<KioskDeviceRow[]> {
  await requirePermission('kiosk.manage');
  const rows = await db.misKioskDevice.findMany({
    where: { status: { in: ['ACTIVE', 'REVOKED'] } },
    select: {
      id: true,
      name: true,
      status: true,
      hardwareLabel: true,
      approvedAt: true,
      revokedAt: true,
      revokedReason: true,
      lastSyncAt: true,
      lastPullAt: true,
      appVersion: true,
      batteryPercent: true,
      isCharging: true,
      queuedPunches: true,
    },
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    take: 100,
  });
  return rows.map((r) => ({
    ...r,
    name: r.name ?? 'Unnamed',
    status: r.status as KioskDeviceRow['status'],
    syncLevel: syncLevel(r.lastSyncAt, now),
    cacheLevel: cacheLevel(r.lastPullAt, now),
  }));
}

export type KioskHealthSummary = {
  devices: {
    id: string;
    name: string;
    level: KioskHealthLevel;
    lastSyncAt: Date | null;
    queuedPunches: number | null;
    batteryPercent: number | null;
    isCharging: boolean | null;
  }[];
  /** The worst tablet decides the card's colour; null when nothing is enrolled. */
  level: KioskHealthLevel | null;
};

/**
 * What the attendance home's gate-kiosk card reads. Needs only `attendance.read`,
 * and carries no hardware detail — the card is a status, the device list is the
 * place for management.
 */
export async function getKioskHealthSummary(now: Date = new Date()): Promise<KioskHealthSummary> {
  await requirePermission('attendance.read');
  const rows = await db.misKioskDevice.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, lastSyncAt: true, queuedPunches: true, batteryPercent: true, isCharging: true },
    orderBy: { name: 'asc' },
    take: 50,
  });
  const devices = rows.map((r) => ({
    id: r.id,
    name: r.name ?? 'Unnamed',
    level: syncLevel(r.lastSyncAt, now),
    lastSyncAt: r.lastSyncAt,
    queuedPunches: r.queuedPunches,
    batteryPercent: r.batteryPercent,
    isCharging: r.isCharging,
  }));
  return { devices, level: devices.length ? worstLevel(devices.map((d) => d.level)) : null };
}

// ---------------------------------------------------------------------------
// Tablet side — no user, no session. Each function opens with a device credential.
// ---------------------------------------------------------------------------

export type EnrolmentRequest = {
  deviceId: string;
  /** What the tablet displays (K10) — "4K7P-92". */
  displayCode: string;
  /** Secret the tablet keeps to collect its token. Returned this once, stored hashed. */
  pollSecret: string;
  expiresAt: Date;
};

/**
 * The tablet asks to be paired. It has no credential yet, so this is the one
 * kiosk entry point that cannot demand one (D18). It therefore does the least a
 * function can: reads no MIS data, returns only the tablet's own new code and
 * secret, sweeps expired requests, and refuses once the pending cap is reached.
 * Nothing it creates does anything until an Admin approves it.
 */
export async function requestEnrolment(input: unknown): Promise<EnrolmentRequest> {
  const hardwareLabel = cleanText((input as { hardwareLabel?: unknown } | null)?.hardwareLabel, MAX_HARDWARE_LABEL_LENGTH);
  const now = new Date();

  // An expired request is dead weight: it holds a code nobody can use. Sweep first
  // so the cap counts only live ones.
  await db.misKioskDevice.deleteMany({ where: { status: 'PENDING', pairingExpiresAt: { lte: now } } });
  const pending = await db.misKioskDevice.count({ where: { status: 'PENDING' } });
  if (pending >= MAX_PENDING_ENROLMENTS) {
    throw new KioskDeviceError('TOO_MANY_PENDING', 'Too many devices are waiting to be paired. Try again in a few minutes.');
  }

  const pollSecret = newSecret('mks_');
  const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newPairingCode();
    try {
      const created = await db.misKioskDevice.create({
        data: {
          status: 'PENDING',
          hardwareLabel,
          pairingCode: code,
          pairingExpiresAt: expiresAt,
          pollSecretHash: sha256Hex(pollSecret),
        },
        select: { id: true },
      });
      return { deviceId: created.id, displayCode: formatPairingCode(code), pollSecret, expiresAt };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error; // a code collision: draw another
    }
  }
  throw new KioskDeviceError('BAD_REQUEST', 'Could not make a pairing code. Try again.');
}

export type ClaimResult =
  | { status: 'PENDING'; expiresAt: Date }
  | { status: 'EXPIRED' }
  | { status: 'REVOKED' }
  /** The token was already collected (or lost). The fix is to pair again. */
  | { status: 'ALREADY_CLAIMED' }
  | { status: 'ACTIVE'; token: string; name: string };

/**
 * The tablet polls until an Admin has approved it, then collects its bearer
 * token — exactly once. It proves itself with the poll secret it was given at
 * request time; a wrong secret and an unknown device id are indistinguishable.
 */
export async function claimEnrolment(input: unknown): Promise<ClaimResult> {
  const raw = (input && typeof input === 'object' ? input : {}) as { deviceId?: unknown; pollSecret?: unknown };
  const deniedError = () => new KioskDeviceError('UNAUTHORIZED', 'Not authorised.');

  // Shape checks first: garbage is refused without touching the database.
  if (typeof raw.deviceId !== 'string' || !UUID_PATTERN.test(raw.deviceId)) throw deniedError();
  if (typeof raw.pollSecret !== 'string' || !POLL_SECRET_PATTERN.test(raw.pollSecret)) throw deniedError();

  const device = await db.misKioskDevice.findUnique({
    where: { id: raw.deviceId },
    select: { id: true, status: true, name: true, pollSecretHash: true, tokenHash: true, pairingExpiresAt: true },
  });
  if (!device || !hashesMatch(sha256Hex(raw.pollSecret), device.pollSecretHash)) throw deniedError();

  const now = new Date();
  if (device.status === 'REVOKED') return { status: 'REVOKED' };
  if (device.status === 'PENDING') {
    if (!device.pairingExpiresAt || device.pairingExpiresAt <= now) return { status: 'EXPIRED' };
    return { status: 'PENDING', expiresAt: device.pairingExpiresAt };
  }

  // ACTIVE. Issue the token once: the `tokenHash: null` guard means two racing
  // polls cannot both be handed a token — one update matches, the other does not.
  if (device.tokenHash) return { status: 'ALREADY_CLAIMED' };
  const token = newSecret('mkd_');
  const issued = await db.misKioskDevice.updateMany({
    where: { id: device.id, status: 'ACTIVE', tokenHash: null },
    data: { tokenHash: sha256Hex(token), tokenIssuedAt: now },
  });
  if (issued.count !== 1) return { status: 'ALREADY_CLAIMED' };

  await logAuditEvent({
    actorId: null,
    action: 'kiosk.token_issued',
    entity: 'MisKioskDevice',
    entityId: device.id,
    after: { name: device.name },
  });
  return { status: 'ACTIVE', token, name: device.name ?? 'Unnamed' };
}

declare const authenticated: unique symbol;
/**
 * A device whose token was checked. The brand means code that mutates "as a
 * device" — `recordDeviceSync` — cannot be handed a bare id from somewhere else;
 * it needs the value only `authenticateDevice` produces.
 */
export type AuthenticatedDevice = {
  readonly id: string;
  readonly name: string;
  /** True only when the caller opted in with `allowRevoked` (Phase 13's punch intake). */
  readonly revoked: boolean;
  readonly [authenticated]: true;
};

/**
 * THE GATE for every tablet request that carries a token. Missing, malformed,
 * unknown and revoked tokens are all refused here, before anything is read on the
 * device's behalf; only the hash of the presented token is ever compared, and the
 * token is never logged or placed in an error.
 *
 * `allowRevoked` exists for exactly one caller: Phase 13's punch intake, because a
 * retired tablet's queued punches are real and must still land (D18). It never
 * lets a revoked device *pull*.
 */
export async function authenticateDevice(
  authorizationHeader: string | null | undefined,
  options: { allowRevoked?: boolean } = {},
): Promise<AuthenticatedDevice> {
  const match = /^Bearer (\S+)$/.exec(authorizationHeader ?? '');
  const token = match?.[1];
  if (!token || !TOKEN_PATTERN.test(token)) throw new KioskDeviceError('UNAUTHORIZED', 'Not authorised.');

  const device = await db.misKioskDevice.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: { id: true, name: true, status: true },
  });
  if (!device) throw new KioskDeviceError('UNAUTHORIZED', 'Not authorised.');

  if (device.status === 'REVOKED') {
    if (!options.allowRevoked) throw new KioskDeviceError('REVOKED', 'This device has been retired.');
    return { id: device.id, name: device.name ?? 'Unnamed', revoked: true } as AuthenticatedDevice;
  }
  if (device.status !== 'ACTIVE') throw new KioskDeviceError('UNAUTHORIZED', 'Not authorised.');
  return { id: device.id, name: device.name ?? 'Unnamed', revoked: false } as AuthenticatedDevice;
}

/**
 * Record that this device made contact successfully — the value the staleness
 * card reads (D19) — plus its self-reported health. Phase 13 calls this after a
 * punch batch lands.
 */
export async function recordDeviceSync(
  device: AuthenticatedDevice,
  health: DeviceHealthReport = {},
  options: { pulled?: boolean } = {},
): Promise<void> {
  const now = new Date();
  await db.misKioskDevice.update({
    where: { id: device.id },
    data: {
      lastSyncAt: now,
      ...(options.pulled ? { lastPullAt: now } : {}),
      ...healthColumns(health, now),
    },
  });
}

// ---------------------------------------------------------------------------
// The pull — what a tablet may know (D19)
// ---------------------------------------------------------------------------

/**
 * THE ALLOW-LIST. A pulled employee has exactly these keys and no others. It is
 * built key by key from an explicit `select`, never by spreading a row, so a
 * column added to the employee table tomorrow cannot reach a stealable tablet by
 * accident. Wages are Owner-only everywhere (D6); the test for this file names
 * this array and fails if it grows or if any key looks like money.
 */
export const PULL_EMPLOYEE_KEYS = ['id', 'name', 'badgeCode', 'shift'] as const;
/** A shift definition — the clock, not a person. Nested in `shift`. */
export const PULL_SHIFT_KEYS = ['id', 'name', 'startTime', 'endTime'] as const;

export type PullShift = { id: string; name: string; startTime: string; endTime: string };
export type PullEmployee = {
  id: string;
  name: string;
  /** The employee code the printed badge encodes. */
  badgeCode: string;
  /** Today's shift, or null — the tablet then uses the shift on the clock now (D19). */
  shift: PullShift | null;
};

export function toPullEmployee(
  employee: { id: string; name: string; employeeCode: string },
  shift: { id: string; name: string; startTime: string; endTime: string } | null,
): PullEmployee {
  return {
    id: employee.id,
    name: employee.name,
    badgeCode: employee.employeeCode,
    shift: shift
      ? { id: shift.id, name: shift.name, startTime: shift.startTime, endTime: shift.endTime }
      : null,
  };
}

export type PullPayload = {
  device: { id: string; name: string };
  pulledAt: string;
  employees: PullEmployee[];
};

/**
 * The roll a tablet works from. Factory-wide, not narrowed by pool (D5): a gate
 * scanner must resolve any badge, exactly as `listEmployeeRoster` does for the
 * web kiosk. Every column is chosen explicitly; nothing beyond id, code and name
 * is read from the employee row at all.
 */
async function buildPullPayload(device: AuthenticatedDevice, now: Date): Promise<PullPayload> {
  // "Today" is the factory's today (D22), as a UTC-midnight `@db.Date` value. The server's
  // own midnight is 2.5 hours off the plant's, and on a UTC+8 host it names yesterday.
  const today = dateKeyToDbDate(factoryDateKey(now, await getFactoryTimezone()));

  const [employees, shifts, allocations, attendance] = await Promise.all([
    db.misEmployee.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, employeeCode: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.misShift.findMany({
      where: { isActive: true },
      select: { id: true, name: true, startTime: true, endTime: true },
    }),
    db.misWorkerAllocation.findMany({
      where: { allocationDate: today, releasedAt: null, deletedAt: null, shiftId: { not: null } },
      select: { employeeId: true, shiftId: true },
    }),
    db.misAttendance.findMany({
      where: { date: today, shiftId: { not: null } },
      select: { employeeId: true, shiftId: true },
    }),
  ]);

  // Allocation beats attendance: it is the plan; attendance is what already happened.
  const shiftOf = new Map<string, string>();
  for (const a of attendance) if (a.shiftId) shiftOf.set(a.employeeId, a.shiftId);
  for (const a of allocations) if (a.shiftId) shiftOf.set(a.employeeId, a.shiftId);
  const shiftById = new Map(shifts.map((s) => [s.id, s]));

  return {
    device: { id: device.id, name: device.name },
    pulledAt: now.toISOString(),
    employees: employees.map((e) => toPullEmployee(e, shiftById.get(shiftOf.get(e.id) ?? '') ?? null)),
  };
}

/**
 * A tablet pulls its employee list. Authenticates first (a revoked device is
 * refused here — `allowRevoked` is not offered), builds the payload, and only
 * then records the sync, so a failed build never counts as a successful one.
 */
export async function pullForDevice(
  authorizationHeader: string | null | undefined,
  body: unknown,
): Promise<PullPayload> {
  const device = await authenticateDevice(authorizationHeader);
  const now = new Date();
  const payload = await buildPullPayload(device, now);
  await recordDeviceSync(device, parseHealthReport(body), { pulled: true });
  return payload;
}
