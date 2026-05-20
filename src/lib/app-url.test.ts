import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAppUrl,
  buildAppUrl,
  isLikelyProblematicInviteBaseUrl,
  getInviteAuthCallbackUrl,
} from './app-url';

describe('getAppUrl', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.SITE_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env = env;
  });

  it('prefers NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://files.example.com/';
    expect(getAppUrl()).toBe('https://files.example.com');
  });

  it('falls back to SITE_URL', () => {
    process.env.SITE_URL = 'https://bpp.example.com';
    expect(getAppUrl()).toBe('https://bpp.example.com');
  });

  it('flags vercel.app as problematic for invites', () => {
    expect(isLikelyProblematicInviteBaseUrl('https://arjun-abc.vercel.app')).toBe(true);
    expect(isLikelyProblematicInviteBaseUrl('https://files.bpp.com')).toBe(false);
  });

  it('builds invite callback URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://files.example.com';
    expect(getInviteAuthCallbackUrl()).toBe(
      'https://files.example.com/auth/callback?type=invite&next=%2Finvite%2Faccept',
    );
  });

  it('buildAppUrl joins paths', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://files.example.com';
    expect(buildAppUrl('/invite/accept')).toBe('https://files.example.com/invite/accept');
  });
});
