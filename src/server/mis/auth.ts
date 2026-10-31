import { can, type MisAction } from '@/lib/mis/permissions';
import type { MisRoleName } from '@/lib/mis/roles';
import { getCurrentUser } from '@/server/auth';

import { getMisRole } from './roles';

/**
 * Thrown when a caller is not allowed to do what it asked for.
 *
 * A distinct class so the (mis) error boundary can tell "you may not" apart
 * from "it broke" and render a calm page instead of a stack trace.
 */
/**
 * Next redacts a thrown error's `message` and drops the subclass entirely once it crosses the
 * Server Component boundary in a production build — `error.name` reliably reads 'Error' there,
 * not 'MisForbiddenError', which is why the (mis) error boundary used to fall back to its
 * generic copy for every real permission refusal (found live via the E2E suite). `digest` is the
 * one property Next does carry across untouched (it's how `notFound()`/`redirect()` identify
 * themselves client-side too), so it doubles as this class's fingerprint.
 */
const MIS_FORBIDDEN_DIGEST = 'MIS_FORBIDDEN';

export class MisForbiddenError extends Error {
  readonly action: MisAction;
  readonly resource?: string;
  readonly digest = MIS_FORBIDDEN_DIGEST;

  constructor(action: MisAction, resource?: string) {
    super(`Not permitted: ${action}${resource ? ` on ${resource}` : ''}`);
    this.name = 'MisForbiddenError';
    this.action = action;
    this.resource = resource;
  }
}

export function isMisForbiddenError(error: unknown): error is MisForbiddenError {
  return (
    error instanceof MisForbiddenError ||
    (error as Error)?.name === 'MisForbiddenError' ||
    (error as { digest?: string })?.digest === MIS_FORBIDDEN_DIGEST
  );
}

export type MisActor = {
  userId: string;
  role: MisRoleName;
};

/**
 * Assert the caller may perform `action`, and hand back who they are.
 *
 * Throws rather than returning a boolean, on purpose: a function that returns
 * false can be called and ignored, and one day will be. A throw makes the
 * forgotten check impossible to miss.
 *
 * Every MIS server module opens with this and closes with logAuditEvent().
 */
export type OwnRecordGrant = {
  /** R2-220: allow any signed-in person who has an employee record, for reads scoped to that record only. */
  self?: true;
  /** R2-220: also allow the signed-in person whose OWN employee record this is. Never anyone else's. */
  ownEmployeeId?: string;
  /** R2-220: same, naming a leave request; allowed when the leave belongs to the signed-in person's own record. */
  ownLeaveId?: string;
  /** R2-222: same, naming a missed-punch regularization request. */
  ownRegularizationId?: string;
};

async function ownsRecord(userId: string, grant: OwnRecordGrant): Promise<boolean> {
  const { db } = await import('@/server/db');
  const me = await db.misEmployee.findFirst({ where: { userProfileId: userId }, select: { id: true } });
  if (!me) return false;
  if (grant.self) return true;
  if (grant.ownEmployeeId) return me.id === grant.ownEmployeeId;
  if (grant.ownRegularizationId) {
    const reg = await db.misPunchRegularization.findUnique({ where: { id: grant.ownRegularizationId }, select: { employeeId: true } });
    return reg?.employeeId === me.id;
  }
  if (!grant.ownLeaveId) return false;
  const leave = await db.misLeaveRequest.findUnique({ where: { id: grant.ownLeaveId }, select: { employeeId: true } });
  return leave?.employeeId === me.id;
}

export async function requirePermission(
  action: MisAction,
  resource?: string,
  own?: OwnRecordGrant,
): Promise<MisActor> {
  const user = await getCurrentUser();
  if (!user) throw new MisForbiddenError(action, resource);

  const role = await getMisRole(user.id);
  if (!role || !can(role, action)) {
    if (own && (await ownsRecord(user.id, own))) return { userId: user.id, role: role ?? 'WORKER' };
    throw new MisForbiddenError(action, resource);
  }

  return { userId: user.id, role };
}

/**
 * The non-throwing form, for rendering only.
 *
 * <Can> uses this to avoid drawing a button the user cannot press. It is a
 * convenience, NOT a security boundary — the server module still calls
 * requirePermission(). Hiding a button has never stopped anyone posting to the
 * endpoint behind it.
 */
export async function checkPermission(action: MisAction): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const role = await getMisRole(user.id);
  return can(role, action);
}
