export const ACCESS_BLOCKED_MESSAGE = 'Access blocked outside approved office/device';
export const ACCESS_BLOCKED_CODE = 'ACCESS_RESTRICTED';

/** Thrown by the access guard when enforcement actively blocks a restricted user. */
export class AccessBlockedError extends Error {
  readonly code = ACCESS_BLOCKED_CODE;
  constructor(message: string = ACCESS_BLOCKED_MESSAGE) {
    super(message);
    this.name = 'AccessBlockedError';
  }
}

export function isAccessBlockedError(e: unknown): e is AccessBlockedError {
  return (
    e instanceof AccessBlockedError ||
    (e instanceof Error && (e as { code?: string }).code === ACCESS_BLOCKED_CODE)
  );
}

/** Enforcement (actual blocking) is OFF unless ACCESS_ENFORCE is exactly "true". */
export function isAccessEnforced(): boolean {
  return process.env.ACCESS_ENFORCE === 'true';
}

/** Detection/observation is ON unless ACCESS_DETECTION is "off". */
export function isAccessDetectionEnabled(): boolean {
  return process.env.ACCESS_DETECTION !== 'off';
}
