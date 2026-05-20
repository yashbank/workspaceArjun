/** Mapped invite failure for admin UI (no tokens or secrets). */
export type InviteErrorCode =
  | 'smtp'
  | 'rate_limit'
  | 'user_exists'
  | 'pending_invite'
  | 'unknown';

export type MappedInviteError = {
  code: InviteErrorCode;
  message: string;
};

type SupabaseAuthErrorShape = {
  message?: string;
  status?: number;
  name?: string;
  code?: string;
};

export const INVITE_ERROR_MESSAGES = {
  smtp: 'Email provider could not send invite. Check SMTP sender/API key/domain.',
  rate_limit: 'Email limit reached. Try later or configure SMTP.',
  user_exists: 'User already exists. Use password reset or remove Auth user.',
  pending_invite: 'Invite already pending. Use Resend or Cancel.',
} as const;

export function logSupabaseInviteError(
  error: unknown,
  context: { email: string; operation: string },
): void {
  const err = error as SupabaseAuthErrorShape;
  console.error('[auth.invite]', {
    operation: context.operation,
    email: context.email,
    message: err.message ?? null,
    status: err.status ?? null,
    name: err.name ?? null,
    code: err.code ?? null,
  });
}

export function mapSupabaseInviteError(error: unknown): MappedInviteError {
  const err = error as SupabaseAuthErrorShape;
  const msg = (err.message ?? '').toLowerCase();
  const code = (err.code ?? '').toLowerCase();

  if (
    msg.includes('already registered') ||
    msg.includes('already been registered') ||
    msg.includes('user already exists') ||
    msg.includes('email address has already been registered') ||
    code === 'email_exists' ||
    code === 'user_already_exists'
  ) {
    return { code: 'user_exists', message: INVITE_ERROR_MESSAGES.user_exists };
  }

  if (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('email rate limit') ||
    code === 'over_email_send_rate_limit'
  ) {
    return { code: 'rate_limit', message: INVITE_ERROR_MESSAGES.rate_limit };
  }

  if (
    msg.includes('error sending invite') ||
    msg.includes('error sending') ||
    msg.includes('smtp') ||
    msg.includes('mail delivery') ||
    msg.includes('invalid sender') ||
    msg.includes('email provider')
  ) {
    return { code: 'smtp', message: INVITE_ERROR_MESSAGES.smtp };
  }

  return {
    code: 'unknown',
    message: err.message?.trim() || 'Failed to send invite email.',
  };
}

export class InviteSendError extends Error {
  readonly code: InviteErrorCode;

  constructor(mapped: MappedInviteError) {
    super(mapped.message);
    this.name = 'InviteSendError';
    this.code = mapped.code;
  }
}

export function throwMappedInviteError(
  error: unknown,
  context: { email: string; operation: string },
): never {
  logSupabaseInviteError(error, context);
  const mapped = mapSupabaseInviteError(error);
  throw new InviteSendError(mapped);
}
