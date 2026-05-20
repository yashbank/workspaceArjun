import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAppUrl,
  buildAppUrl,
  isBlockedInviteUrl,
  isBlockedInviteHost,
  getInviteAuthCallbackUrl,
  getRecoveryAuthCallbackUrl,
  getInviteUrlWarnings,
  PRODUCTION_APP_URL,
} from './app-url';

describe('getAppUrl', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, NODE_ENV: 'test' };
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

  it('uses production fallback when unset in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(getAppUrl()).toBe(PRODUCTION_APP_URL);
  });

  it('never uses VERCEL_URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.VERCEL_URL = 'arjun-git-main.vercel.app';
    expect(getAppUrl()).toBe(PRODUCTION_APP_URL);
  });

  it('rejects git-branch preview hosts in NEXT_PUBLIC_APP_URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://workspace-arjun-git-main.vercel.app';
    vi.stubEnv('NODE_ENV', 'production');
    expect(getAppUrl()).toBe(PRODUCTION_APP_URL);
  });

  it('allows stable production vercel.app host', () => {
    process.env.NEXT_PUBLIC_APP_URL = PRODUCTION_APP_URL;
    expect(isBlockedInviteUrl(PRODUCTION_APP_URL)).toBe(false);
    expect(isBlockedInviteHost('workspace-arjun.vercel.app')).toBe(false);
  });

  it('blocks git- hosts', () => {
    expect(isBlockedInviteHost('workspace-arjun-git-main.vercel.app')).toBe(true);
    expect(isBlockedInviteUrl('https://workspace-arjun-git-main.vercel.app')).toBe(true);
  });

  it('blocks vercel.app/login URLs', () => {
    expect(isBlockedInviteUrl('https://something.vercel.app/login')).toBe(true);
  });

  it('builds invite callback URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://files.example.com';
    expect(getInviteAuthCallbackUrl()).toBe(
      'https://files.example.com/auth/callback?type=invite&next=%2Finvite%2Faccept',
    );
  });

  it('builds recovery callback URL', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://files.example.com';
    expect(getRecoveryAuthCallbackUrl()).toBe(
      'https://files.example.com/auth/callback?type=recovery&next=%2Freset-password',
    );
  });

  it('buildAppUrl joins paths', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://files.example.com';
    expect(buildAppUrl('/invite/accept')).toBe('https://files.example.com/invite/accept');
  });

  it('warns when production env is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const warnings = getInviteUrlWarnings();
    expect(warnings.some((w) => w.includes('NEXT_PUBLIC_APP_URL'))).toBe(true);
  });

  it('does not warn when VERCEL_URL differs but NEXT_PUBLIC_APP_URL is set', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_APP_URL = PRODUCTION_APP_URL;
    process.env.VERCEL_URL = 'workspace-arjun-git-main.vercel.app';
    expect(getInviteUrlWarnings()).toEqual([]);
  });
});
