/**
 * Demo reset script — wipes all user-generated data, re-seeds settings,
 * then populates fresh demo data.
 *
 * Usage: pnpm demo:reset
 * Guard: Only runs when ALLOW_BOOTSTRAP=true
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (process.env.ALLOW_BOOTSTRAP !== 'true') {
  console.error('Demo reset is only allowed when ALLOW_BOOTSTRAP=true (local dev only).');
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

async function main() {
  console.log('Resetting workspace data...');

  await prisma.auditEvent.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.fileVersion.deleteMany();
  await prisma.file.deleteMany();
  await prisma.folder.deleteMany();
  await prisma.storageUsage.deleteMany();
  await prisma.workspaceSetting.deleteMany();

  console.log('All data cleared (user profiles preserved).');

  // Re-seed default settings
  const DEFAULT_SETTINGS: Record<string, string> = {
    file_size_cap_bytes: String(200 * 1024 * 1024),
    version_retention_count: '10',
    workspace_quota_bytes: String(2 * 1024 * 1024 * 1024 * 1024),
    password_min_length: '10',
    mfa_required_for_admins: 'true',
  };

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.workspaceSetting.create({ data: { key, value } });
  }
  await prisma.storageUsage.create({ data: { totalBytes: 0, fileCount: 0 } });

  console.log('Default settings restored.');
  console.log('Run `pnpm demo:seed` to populate demo data, or start fresh.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
