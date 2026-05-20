export const INVITE_ACCEPT_PATH = '/invite/accept';

export type AuthCallbackOtpType = 'invite' | 'recovery' | 'signup' | 'magiclink' | 'email';

/** Maps URL `type` param to Supabase verifyOtp type. */
export function mapCallbackOtpType(type: string | null): AuthCallbackOtpType | null {
  if (!type) return null;
  const normalized = type.toLowerCase();
  if (
    normalized === 'invite' ||
    normalized === 'recovery' ||
    normalized === 'signup' ||
    normalized === 'magiclink' ||
    normalized === 'email'
  ) {
    return normalized;
  }
  return null;
}

/** Where to send the user after a successful callback. */
export function resolveAuthCallbackRedirect(type: string | null, next: string | null): string {
  const otpType = mapCallbackOtpType(type);

  if (otpType === 'recovery') return '/reset-password';
  if (otpType === 'invite') return INVITE_ACCEPT_PATH;
  if (otpType === 'signup') return INVITE_ACCEPT_PATH;

  if (next === INVITE_ACCEPT_PATH || next?.startsWith('/invite/')) {
    return INVITE_ACCEPT_PATH;
  }
  if (next === '/reset-password' || next?.startsWith('/reset-password')) {
    return '/reset-password';
  }

  if (next && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }

  return '/';
}

/** Friendly error landing page for failed/expired tokens. */
export function resolveAuthCallbackErrorRedirect(
  origin: string,
  type: string | null,
): string {
  const otpType = mapCallbackOtpType(type);
  if (otpType === 'invite') {
    return `${origin}${INVITE_ACCEPT_PATH}?error=expired`;
  }
  if (otpType === 'recovery') {
    return `${origin}/reset-password?error=expired`;
  }
  return `${origin}/login?error=auth_callback_failed`;
}
