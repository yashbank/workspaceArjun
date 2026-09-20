/**
 * The gate tablet's API doors — the ONLY paths that skip the portal's login
 * redirect (Phase 12, D18).
 *
 * A tablet has no browser session, so the login guard in
 * `src/lib/supabase/middleware.ts` would bounce it to /login. Exempting a path
 * from that guard opens an unauthenticated door into the MIS, so this list is:
 *
 *  - **exact**, not a prefix. `/api/mis/kiosk/pull` is on it; `/api/mis/kiosk`,
 *    `/api/mis/kiosk/pull/`, `/api/mis/kiosk/anything-else` and every other
 *    `/api/mis/**` route are not. A new kiosk route (Phase 13's punches) is
 *    unreachable by a tablet until someone adds it here *and* to the test that
 *    pins this list — a deliberate friction.
 *  - **self-authenticating.** Every route behind it checks a device credential
 *    in `src/server/mis/kiosk-device.ts` before reading anything. Skipping the
 *    session guard moves the check; it does not remove it.
 *
 * Pure and dependency-free so the middleware and the test read the same list.
 */

export const KIOSK_DEVICE_ROUTES = [
  /** The tablet asks to be paired. No credential exists yet — see D18. */
  '/api/mis/kiosk/enrol',
  /** The tablet collects its token, proving itself with the poll secret. */
  '/api/mis/kiosk/enrol/claim',
  /** The tablet pulls its employee list, proving itself with its bearer token. */
  '/api/mis/kiosk/pull',
  /** The tablet sends a punch — a retired tablet's too, flagged (D18). Token-authenticated. */
  '/api/mis/kiosk/punch',
] as const;

export function isKioskDeviceRoute(pathname: string): boolean {
  return (KIOSK_DEVICE_ROUTES as readonly string[]).includes(pathname);
}
