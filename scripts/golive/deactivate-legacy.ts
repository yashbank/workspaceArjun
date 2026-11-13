/**
 * Deactivates (isActive=false, never deletes) legacy employees that are NOT in the client file
 * (data/golive/cleaned-employees.json) and NOT linked to a login. Production/QC/store rows that point
 * at them are untouched. Dry-run by default; --execute needs CONFIRM_WIPE=1 (see _gate.ts).
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './_gate';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

async function main() {
  const { prisma, execute } = openDb();
  const keep = new Set<string>((JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'golive', 'cleaned-employees.json'), 'utf8')) as { employeeCode: string }[]).map((e) => e.employeeCode));
  const active = await prisma.misEmployee.findMany({ where: { isActive: true, deletedAt: null }, select: { id: true, employeeCode: true, name: true, userProfileId: true } });
  const targets = active.filter((e) => !keep.has(e.employeeCode) && !e.userProfileId);
  console.log(`active employees ${active.length}; client file ${keep.size}; linked to a login kept; WOULD deactivate ${targets.length}`);
  for (const t of targets) console.log(`  ${t.employeeCode} ${t.name}`);
  if (execute) {
    const r = await prisma.misEmployee.updateMany({ where: { id: { in: targets.map((t) => t.id) } }, data: { isActive: false } });
    console.log(`DEACTIVATED ${r.count}`);
  } else console.log('\nDRY RUN only.');
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
