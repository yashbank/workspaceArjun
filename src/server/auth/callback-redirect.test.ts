import { describe, it, expect } from 'vitest';
import {
  mapCallbackOtpType,
  resolveAuthCallbackRedirect,
  resolveAuthCallbackErrorRedirect,
} from './callback-redirect';

describe('mapCallbackOtpType', () => {
  it('maps known types', () => {
    expect(mapCallbackOtpType('invite')).toBe('invite');
    expect(mapCallbackOtpType('recovery')).toBe('recovery');
  });

  it('rejects unknown types', () => {
    expect(mapCallbackOtpType('unknown')).toBeNull();
  });
});

describe('resolveAuthCallbackRedirect', () => {
  it('sends invite to password setup', () => {
    expect(resolveAuthCallbackRedirect('invite', null)).toBe('/invite/accept');
    expect(resolveAuthCallbackRedirect('invite', '/invite/accept')).toBe('/invite/accept');
  });

  it('sends recovery to reset password', () => {
    expect(resolveAuthCallbackRedirect('recovery', null)).toBe('/reset-password');
    expect(resolveAuthCallbackRedirect('recovery', '/reset-password')).toBe('/reset-password');
  });

  it('honors safe next path', () => {
    expect(resolveAuthCallbackRedirect(null, '/files')).toBe('/files');
  });
});

describe('resolveAuthCallbackErrorRedirect', () => {
  it('routes invite errors to invite accept', () => {
    expect(resolveAuthCallbackErrorRedirect('http://localhost:3000', 'invite')).toBe(
      'http://localhost:3000/invite/accept?error=expired',
    );
  });

  it('routes recovery errors to reset password', () => {
    expect(resolveAuthCallbackErrorRedirect('http://localhost:3000', 'recovery')).toBe(
      'http://localhost:3000/reset-password?error=expired',
    );
  });
});

describe('email change confirmation link', () => {
  it('is a known OTP type and lands on the account page', () => {
    expect(mapCallbackOtpType('email_change')).toBe('email_change');
    expect(resolveAuthCallbackRedirect('email_change', null)).toBe('/mis/me/account');
  });
  it('recovery still wins its own page and an open redirect is refused', () => {
    expect(resolveAuthCallbackRedirect('recovery', '/x')).toBe('/reset-password');
    expect(resolveAuthCallbackRedirect(null, '//evil.com')).toBe('/');
  });
});
