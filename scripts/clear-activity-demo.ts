/**
 * Owner-only demo reset: deletes all audit_stars, then all audit_events.
 *
 * Usage (from app/):
 *   CONFIRM_CLEAR_ACTIVITY=true pnpm demo:clear-activity
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

if (process.env.CONFIRM_CLEAR_ACTIVITY !== 'true') {
  console.error(
    'Refusing to run. Set CONFIRM_CLEAR_ACTIVITY=true to confirm deletion of all activity history.',
  );
  process.exit(1);
}

const connectionString =
  process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.DIRECT_URL;

if (!connectionString) {
  console.error('Missing RUNTIME_DATABASE_URL, DATABASE_URL, or DIRECT_URL');
  process.exit(1);
}

const isRemote =
  !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');

const adapter = new PrismaPg({
  connectionString,
  ssl: isRemote ? { rejectUnauthorized: false } : undefined,
});
const db = new PrismaClient({ adapter });

async function main() {
  const stars = await db.auditStar.deleteMany({});
  const events = await db.auditEvent.deleteMany({});
  console.log(`Cleared activity: ${stars.count} stars, ${events.count} audit events.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
