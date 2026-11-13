/**
 * Read-only. Writes the comma-separated user ids of every ACTIVE employee that has a login to
 * ~/golive-credentials/mis-enabled-ids.txt, to be APPENDED to MIS_ENABLED_ACCOUNTS (Vercel env).
 * Without an id on that list a user gets a 404 on every /mis page (src/server/mis/flags.ts).
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from './_gate';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function main() {
  const { prisma } = openDb();
  const rows = await prisma.misEmployee.findMany({ where: { userProfileId: { not: null }, isActive: true }, select: { userProfileId: true } });
  const ids = [...new Set(rows.map((r) => r.userProfileId as string))];
  const out = path.join(os.homedir(), 'golive-credentials', 'mis-enabled-ids.txt');
  fs.writeFileSync(out, ids.join(','), { mode: 0o600 });
  console.log(`${ids.length} user ids written to ${out}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
