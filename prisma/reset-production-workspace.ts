/**
 * Production-safe workspace reset — removes file/workspace data only.
 *
 * Usage:
 *   CONFIRM_RESET_WORKSPACE=true pnpm workspace:reset
 *
 * Does NOT delete Supabase auth users, UserProfile rows, or roles.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { deleteObject, isStorageConfigured } from '../src/server/storage';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (process.env.CONFIRM_RESET_WORKSPACE !== 'true') {
  console.error(
    'Refusing to run: set CONFIRM_RESET_WORKSPACE=true to confirm workspace reset.',
  );
  process.exit(1);
}

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/arjun';
const isRemote =
  !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');

const adapter = new PrismaPg({
  connectionString,
  ssl: isRemote ? { rejectUnauthorized: false } : undefined,
});
const prisma = new PrismaClient({ adapter });

async function deleteStorageKeys(keys: string[]): Promise<{ ok: number; failed: number }> {
  if (!isStorageConfigured() || keys.length === 0) {
    return { ok: 0, failed: 0 };
  }

  let ok = 0;
  let failed = 0;

  for (const key of keys) {
    try {
      await deleteObject(key);
      ok += 1;
    } catch (e) {
      failed += 1;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  [storage] failed to delete "${key}": ${msg}`);
    }
  }

  return { ok, failed };
}

async function main() {
  console.log('=== Production workspace reset ===\n');

  const owner = await prisma.userProfile.findFirst({
    where: { role: 'owner', status: 'active' },
    select: { id: true, email: true, name: true },
  });
  if (owner) {
    console.log(`Owner preserved: ${owner.name ?? owner.email} (${owner.id})\n`);
  } else {
    console.warn('Warning: no active owner profile found. User profiles are not deleted.\n');
  }

  const versions = await prisma.fileVersion.findMany({
    select: { id: true, storageKey: true },
  });
  const storageKeys = [...new Set(versions.map((v) => v.storageKey).filter(Boolean))];

  console.log(`Deleting ${storageKeys.length} storage object(s) (best-effort)...`);
  const storageResult = await deleteStorageKeys(storageKeys);
  console.log(
    `  Storage: ${storageResult.ok} deleted, ${storageResult.failed} failed/skipped\n`,
  );

  const [
    favoritesDeleted,
    auditDeleted,
    notificationsDeleted,
  ] = await Promise.all([
    prisma.favorite.deleteMany(),
    prisma.auditEvent.deleteMany(),
    prisma.notification.deleteMany(),
  ]);

  await prisma.file.updateMany({ data: { currentVersionId: null } });

  const [versionsDeleted, filesDeleted, foldersDeleted, storageRowsDeleted] =
    await Promise.all([
      prisma.fileVersion.deleteMany(),
      prisma.file.deleteMany(),
      prisma.folder.deleteMany(),
      prisma.storageUsage.deleteMany(),
    ]);

  await prisma.storageUsage.create({
    data: { totalBytes: 0, fileCount: 0 },
  });

  const profileCount = await prisma.userProfile.count();

  console.log('=== Summary ===');
  console.log(`  Deleted files:        ${filesDeleted.count}`);
  console.log(`  Deleted folders:      ${foldersDeleted.count}`);
  console.log(`  Deleted versions:     ${versionsDeleted.count}`);
  console.log(`  Deleted audit events: ${auditDeleted.count}`);
  console.log(`  Deleted favorites:    ${favoritesDeleted.count}`);
  console.log(`  Deleted notifications:${notificationsDeleted.count}`);
  console.log(`  Storage rows reset:   ${storageRowsDeleted.count} removed, 1 created (0 bytes)`);
  console.log(`  User profiles kept:   ${profileCount}`);
  console.log(`  Workspace settings:   preserved`);
  console.log('\nWorkspace reset complete. Dashboard should show a clean empty state.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
