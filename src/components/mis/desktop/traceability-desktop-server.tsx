import type { TraceView } from '@/lib/mis/trace';
import { isMisForbiddenError } from '@/server/mis/auth';
import { getTraceView } from '@/server/mis/traceability-view';

import { TraceabilityDesktop } from './traceability-desktop';

/**
 * The server half of D11: one search, one answer. A second query on a page the phone also serves, so a failure is
 * LOGGED (never swallowed) and the desktop half says so — the phone screen still renders. A refusal is "no access".
 */
export async function TraceabilityDesktopServer({ q }: { q: unknown }) {
  let view: TraceView | null = null;
  let denied = false;
  try {
    view = await getTraceView({ q });
  } catch (error) {
    if (isMisForbiddenError(error)) denied = true;
    else console.error('[mis-traceability] the trace failed to load', error);
  }
  return <TraceabilityDesktop view={view} denied={denied} />;
}
