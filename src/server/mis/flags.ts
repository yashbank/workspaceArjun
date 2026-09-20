/**
 * MIS feature flag — pure predicate, no I/O.
 *
 * The MIS module ships to production dark: merged, deployed, and invisible to
 * every existing client account until an id is added to MIS_ENABLED_ACCOUNTS.
 * Flipping an account on is an env change, not a redeploy.
 *
 * Read on the server only (see ./guard). The value is never serialised into a
 * client payload, so the browser bundle carries no hint the module exists.
 */

/** Parse the comma-separated allow-list. Unset or blank means nobody. */
function enabledAccountIds(): string[] {
  return (process.env.MIS_ENABLED_ACCOUNTS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Is the MIS enabled for this user id?
 *
 * Default is OFF. A flag that defaults on is not a flag.
 */
export function isMisEnabled(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return enabledAccountIds().includes(userId);
}
