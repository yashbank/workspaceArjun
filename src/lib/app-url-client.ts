'use client';

/**
 * Client-safe auth redirect URLs — uses NEXT_PUBLIC_APP_URL only (never window.location.origin).
 * Prevents preview-tab URLs from being embedded in password-reset emails.
 */

const PRODUCTION_APP_URL = 'https://workspace-arjun.vercel.app';

function clientBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '');
  if (fromEnv && (fromEnv.startsWith('http://') || fromEnv.startsWith('https://'))) {
    return fromEnv;
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }
  return PRODUCTION_APP_URL;
}

export function getClientRecoveryAuthCallbackUrl(): string {
  const next = encodeURIComponent('/reset-password');
  return `${clientBaseUrl()}/auth/callback?type=recovery&next=${next}`;
}
