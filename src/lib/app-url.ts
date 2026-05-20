/**
 * Canonical app base URL for invite links and auth redirects.
 * Prefer NEXT_PUBLIC_APP_URL, then SITE_URL. Do not rely on VERCEL_URL for invites in production.
 */

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

/** Resolved public app URL (no trailing slash). */
export function getAppUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.SITE_URL?.trim();
  if (explicit) return normalizeBaseUrl(explicit);

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000';
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return normalizeBaseUrl(vercel);
  }

  return 'http://localhost:3000';
}

export function buildAppUrl(path: string): string {
  const base = getAppUrl();
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

/** Invite email → Supabase redirect → password setup */
export function getInviteAuthCallbackUrl(): string {
  const next = encodeURIComponent('/invite/accept');
  return `${buildAppUrl('/auth/callback')}?type=invite&next=${next}`;
}

/** Hosts that often break invite flows (preview deploys, access gates). */
export function isLikelyProblematicInviteBaseUrl(url?: string): boolean {
  const base = url ?? getAppUrl();
  try {
    const host = new URL(base).hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return false;
    if (host.endsWith('.vercel.app')) return true;
    if (host.includes('vercel.live')) return true;
    return false;
  } catch {
    return true;
  }
}

export function getInviteUrlWarning(): string | null {
  if (!isLikelyProblematicInviteBaseUrl()) return null;
  const base = getAppUrl();
  return (
    `Invite links use ${base}. Preview or Vercel deployment URLs often fail behind access ` +
    `protection — set NEXT_PUBLIC_APP_URL to your stable production domain and match Supabase Site URL.`
  );
}
