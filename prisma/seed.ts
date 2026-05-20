import dotenv from 'dotenv';
import path from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/arjun';

const isRemote =
  !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');

const adapter = new PrismaPg({
  connectionString,
  ssl: isRemote ? { rejectUnauthorized: false } : undefined,
});
const prisma = new PrismaClient({ adapter });

const DEFAULT_SETTINGS: Record<string, string> = {
  file_size_cap_bytes: String(200 * 1024 * 1024), // 200 MB
  version_retention_count: '10',
  workspace_quota_bytes: String(2 * 1024 * 1024 * 1024 * 1024), // 2 TB
  workspace_max_users: '15',
  password_min_length: '10',
  mfa_required_for_admins: 'true',
};

async function main() {
  console.log('Seeding workspace settings...');

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.workspaceSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  const existing = await prisma.storageUsage.findFirst();
  if (!existing) {
    await prisma.storageUsage.create({
      data: { totalBytes: 0, fileCount: 0 },
    });
    console.log('Initialized storage usage record.');
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
