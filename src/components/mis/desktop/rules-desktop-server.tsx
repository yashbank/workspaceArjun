import type { RulesLedgerView } from '@/lib/mis/rules-ledger';
import { isMisForbiddenError } from '@/server/mis/auth';
import { getRulesLedger } from '@/server/mis/rules-ledger';

import { RulesDesktop } from './rules-desktop';

/**
 * The server half of D12. A refusal is "no access"; any other failure is LOGGED (never swallowed) and the desktop
 * half says so — the phone screen still renders.
 */
export async function RulesDesktopServer({ asOf, rule, scheduled }: { asOf?: unknown; rule?: unknown; scheduled?: boolean }) {
  let view: RulesLedgerView | null = null;
  let denied = false;
  try {
    view = await getRulesLedger({ asOf, rule });
  } catch (e) {
    if (isMisForbiddenError(e)) denied = true;
    else console.error('[mis-rules] the rules ledger failed to load', e);
  }
  return <RulesDesktop view={view} denied={denied} scheduled={scheduled} />;
}
