import { describe, it, expect } from 'vitest';
import { mapSupabaseInviteError, INVITE_ERROR_MESSAGES } from './invite-errors';

describe('mapSupabaseInviteError', () => {
  it('maps user already registered', () => {
    const mapped = mapSupabaseInviteError({
      message: 'User already registered',
      code: 'email_exists',
    });
    expect(mapped.code).toBe('user_exists');
    expect(mapped.message).toBe(INVITE_ERROR_MESSAGES.user_exists);
  });

  it('maps rate limit errors', () => {
    const mapped = mapSupabaseInviteError({
      message: 'email rate limit exceeded',
      code: 'over_email_send_rate_limit',
    });
    expect(mapped.code).toBe('rate_limit');
    expect(mapped.message).toBe(INVITE_ERROR_MESSAGES.rate_limit);
  });

  it('maps SMTP / send failures', () => {
    const mapped = mapSupabaseInviteError({
      message: 'Error sending invite email',
    });
    expect(mapped.code).toBe('smtp');
    expect(mapped.message).toBe(INVITE_ERROR_MESSAGES.smtp);
  });

  it('falls back to unknown with message', () => {
    const mapped = mapSupabaseInviteError({ message: 'Something unexpected' });
    expect(mapped.code).toBe('unknown');
    expect(mapped.message).toBe('Something unexpected');
  });
});
