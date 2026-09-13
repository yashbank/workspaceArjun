import type { ReactNode } from 'react';

import type { MisAction } from '@/lib/mis/permissions';
import { checkPermission } from '@/server/mis/auth';

/**
 * Render children only if the current user may perform `action`.
 *
 * A CONVENIENCE, NOT A SECURITY BOUNDARY. Its only job is to avoid drawing a
 * button the user cannot press. The server module behind that button still
 * calls requirePermission() — hiding a control has never stopped anyone posting
 * to the endpoint underneath it. If you ever find yourself relying on <Can> to
 * keep data safe, the check is missing somewhere in server/mis/.
 *
 * It asks the same matrix the server check asks, so the two cannot disagree.
 */
export async function Can({
  action,
  fallback = null,
  children,
}: {
  action: MisAction;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const allowed = await checkPermission(action);
  return <>{allowed ? children : fallback}</>;
}
