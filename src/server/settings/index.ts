import { db } from '@/server/db';

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.workspaceSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.workspaceSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getFileSizeCapBytes(): Promise<number> {
  const val = await getSetting('file_size_cap_bytes');
  return val ? Number(val) : 200 * 1024 * 1024;
}

export async function getVersionRetentionCount(): Promise<number> {
  const val = await getSetting('version_retention_count');
  return val ? Number(val) : 10;
}

export async function getWorkspaceQuotaBytes(): Promise<number> {
  const val = await getSetting('workspace_quota_bytes');
  return val ? Number(val) : 2 * 1024 * 1024 * 1024 * 1024;
}

/** Maximum active users + pending invites (default 15 for BPP). */
export async function getMaxUsers(): Promise<number> {
  const val = await getSetting('workspace_max_users');
  const n = val ? Number(val) : 15;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 15;
}

// ---------------------------------------------------------------------------
// Access enforcement toggle (DB-backed — the source of truth that the Security
// page on/off switch writes to, replacing the ACCESS_ENFORCE env flag). The
// env value is only a first-run default until the toggle is used.
// ---------------------------------------------------------------------------

const ACCESS_ENFORCE_KEY = 'access_enforce';
const ENFORCE_CACHE_MS = 10_000;
let enforceCache: { value: boolean; at: number } | null = null;

function envEnforceDefault(): boolean {
  return (process.env.ACCESS_ENFORCE ?? '').trim().toLowerCase() === 'true';
}

/**
 * Whether enforcement (actual blocking) is active. DB-authoritative once the
 * Security toggle has been used; before then (or if the settings read fails)
 * it falls back to the ACCESS_ENFORCE env default. The DB result is cached for
 * a few seconds so the per-request API guard stays fast; the env fallback is
 * never cached, so tests and ops env changes take effect immediately.
 */
export async function getAccessEnforced(): Promise<boolean> {
  const now = Date.now();
  if (enforceCache && now - enforceCache.at < ENFORCE_CACHE_MS) return enforceCache.value;
  let dbVal: string | null = null;
  try {
    dbVal = await getSetting(ACCESS_ENFORCE_KEY);
  } catch {
    dbVal = null;
  }
  if (dbVal === null) return envEnforceDefault();
  const value = dbVal === 'true';
  enforceCache = { value, at: now };
  return value;
}

/** Sets the enforcement toggle and refreshes the cache immediately. */
export async function setAccessEnforced(enabled: boolean): Promise<void> {
  await setSetting(ACCESS_ENFORCE_KEY, enabled ? 'true' : 'false');
  enforceCache = { value: enabled, at: Date.now() };
}
