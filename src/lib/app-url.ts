/**
 * Canonical app base URL for invite and auth email redirects.
 *
 * Production invites MUST use NEXT_PUBLIC_APP_URL (or SITE_URL).
 * Never use VERCEL_URL, preview hosts, or git-branch deployment URLs.
 */

/** Stable production deployment — fallback when explicit env is missing in production. */
export const PRODUCTION_APP_URL = 'https://workspace-arjun.vercel.app';

export type AppUrlSource =
  | 'NEXT_PUBLIC_APP_URL'
  | 'SITE_URL'
  | 'PRODUCTION_FALLBACK'
  | 'DEVELOPMENT_LOCALHOST';

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function parseHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Preview / branch / protected Vercel hosts that break Supabase invite redirects. */
export function isBlockedInviteHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return false;
  if (h.includes('git-') || h.includes('-git-')) return true;
  if (h.includes('vercel.live')) return true;
  return false;
}

/** Full URL string checks for misconfigured redirects. */
export function isBlockedInviteUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('vercel.app/login')) return true;
  if (/\/login\/?(\?|$)/.test(lower) && !lower.includes('/auth/callback')) return true;
  const host = parseHost(url);
  if (host && isBlockedInviteHost(host)) return true;
  return false;
}

function resolveExplicitAppUrl(): { url: string; source: AppUrlSource } | null {
  const nextPublic = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (nextPublic) {
    const url = normalizeBaseUrl(nextPublic);
    if (url && !isBlockedInviteUrl(url)) {
      return { url, source: 'NEXT_PUBLIC_APP_URL' };
    }
  }

  const site = process.env.SITE_URL?.trim();
  if (site) {
    const url = normalizeBaseUrl(site);
    if (url && !isBlockedInviteUrl(url)) {
      return { url, source: 'SITE_URL' };
    }
  }

  return null;
}

/** How the public app URL was resolved (for admin diagnostics). */
export function resolveAppUrlSource(): AppUrlSource {
  const resolved = resolveExplicitAppUrl();
  if (resolved) return resolved.source;
  if (process.env.NODE_ENV === 'development') return 'DEVELOPMENT_LOCALHOST';
  return 'PRODUCTION_FALLBACK';
}

/** Resolved public app URL (no trailing slash). Never uses VERCEL_URL. */
export function getAppUrl(): string {
  const explicit = resolveExplicitAppUrl();
  if (explicit) return explicit.url;

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }

  return PRODUCTION_APP_URL;
}

export function buildAppUrl(path: string): string {
  const base = getAppUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function getInviteAuthCallbackUrl(): string {
  const next = encodeURIComponent('/invite/accept');
  return `${buildAppUrl('/auth/callback')}?type=invite&next=${next}`;
}

export function getRecoveryAuthCallbackUrl(): string {
  const next = encodeURIComponent('/reset-password');
  return `${buildAppUrl('/auth/callback')}?type=recovery&next=${next}`;
}

/** Log invite redirect target without tokens (safe for production logs). */
export function logAuthEmailRedirect(
  context: string,
  redirectTo: string,
  meta?: Record<string, string | undefined>,
): void {
  try {
    const u = new URL(redirectTo);
    console.info('[auth.invite.redirect]', {
      context,
      redirectHost: u.host,
      redirectPath: `${u.pathname}${u.search ? '?…' : ''}`,
      queryKeys: [...u.searchParams.keys()],
      appUrl: getAppUrl(),
      appUrlSource: resolveAppUrlSource(),
      ...meta,
    });
  } catch {
    console.warn('[auth.invite.redirect]', { context, redirectTo: '(invalid URL)', ...meta });
  }
}

export function getInviteUrlWarnings(): string[] {
  const warnings: string[] = [];
  const base = getAppUrl();
  const rawNext = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? '';
  const rawSite = process.env.SITE_URL?.trim() ?? '';

  if (!rawNext && !rawSite && process.env.NODE_ENV === 'production') {
    warnings.push(
      `NEXT_PUBLIC_APP_URL is not set — using production fallback ${PRODUCTION_APP_URL}. Set it on Vercel Production.`,
    );
  }

  if (rawNext && isBlockedInviteUrl(normalizeBaseUrl(rawNext))) {
    warnings.push(
      `NEXT_PUBLIC_APP_URL (${rawNext}) looks like a preview or login URL. Use ${PRODUCTION_APP_URL}.`,
    );
  }

  if (rawNext.toLowerCase().includes('git-')) {
    warnings.push('NEXT_PUBLIC_APP_URL contains "git-" — use the stable production URL, not a branch deploy.');
  }

  if (base.toLowerCase().includes('vercel.app/login')) {
    warnings.push('App URL points at vercel.app/login — invites will fail. Use your app home URL.');
  }

  const host = parseHost(base);
  if (host && isBlockedInviteHost(host)) {
    warnings.push(
      `App host "${host}" looks like a preview deployment. Set NEXT_PUBLIC_APP_URL=${PRODUCTION_APP_URL}.`,
    );
  }

  return warnings;
}

export function getInviteUrlConfig() {
  return {
    appUrl: getAppUrl(),
    appUrlSource: resolveAppUrlSource(),
    inviteCallbackUrl: getInviteAuthCallbackUrl(),
    recoveryCallbackUrl: getRecoveryAuthCallbackUrl(),
    warnings: getInviteUrlWarnings(),
    productionFallback: PRODUCTION_APP_URL,
  };
}

/** @deprecated use getInviteUrlWarnings */
export function getInviteUrlWarning(): string | null {
  const w = getInviteUrlWarnings();
  return w.length > 0 ? w.join(' ') : null;
}

/** @deprecated use isBlockedInviteUrl */
export function isLikelyProblematicInviteBaseUrl(url?: string): boolean {
  const base = url ?? getAppUrl();
  return isBlockedInviteUrl(base);
}
