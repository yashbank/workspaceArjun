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
export async function requirePermission(
  action: MisAction,
  resource?: string,
): Promise<MisActor> {
  const user = await getCurrentUser();
  if (!user) throw new MisForbiddenError(action, resource);

  const role = await getMisRole(user.id);
  if (!role || !can(role, action)) {
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
