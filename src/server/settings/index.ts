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
