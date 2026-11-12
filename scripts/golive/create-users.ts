/**
 * Go-live: create the factory's software logins (Supabase auth user + UserProfile + MisEmployee/MIS role).
 *
 *   pnpm exec tsx scripts/golive/create-users.ts              # DRY RUN: prints email + role, touches nothing
 *   pnpm exec tsx scripts/golive/create-users.ts --execute    # really creates (LIVE auth + DB per .env.local)
 *   --file <path>   input: cleaned-users.json ([{name, role}]) or the client .xlsx ('2 Software Users')
 *
 * Idempotent: an email / auth user that already exists is SKIPPED, never overwritten or reset. An Owner
 * row is skipped when an active Owner already exists. Passwords are random (14 chars), flagged
 * user_metadata.must_change_password=true, and written ONLY to ~/golive-credentials/credentials-YYYYMMDD.csv
 * (chmod 600, outside the repo). They are never printed.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/generated/prisma/client';
import { buildEmails, csvCell, generateTempPassword, mapSheetRole } from '../../src/lib/mis/golive-users';
import type { MisRoleName } from '../../src/lib/mis/roles';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const EXECUTE = process.argv.includes('--execute');
const fileArg = process.argv.indexOf('--file');
const CLEANED = path.join(__dirname, '..', '..', 'data', 'golive', 'cleaned-users.json');
const XLSX_FALLBACK = '/Users/yashbankar/Downloads/BPP-Client-Data-Template - R1.xlsx';

type InRow = { name: string; roleLabel: string };

function loadRows(): InRow[] {
  const file = fileArg > -1 ? process.argv[fileArg + 1] : fs.existsSync(CLEANED) ? CLEANED : XLSX_FALLBACK;
  console.log(`Input: ${file}`);
  let rows: InRow[];
  if (file.endsWith('.json')) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>[];
    rows = raw.map((r) => ({
      name: String(r.name ?? r.fullName ?? r["Full Name"] ?? "").replace(/\s+/g, " ").trim(),
      roleLabel: String(r.role ?? r.Role ?? '').trim(),
    }));
  } else {
    const ws = XLSX.readFile(file).Sheets['2 Software Users'];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);
    rows = raw.map((r) => ({ name: String(r["Full Name"] ?? "").replace(/\s+/g, " ").trim(), roleLabel: String(r['Role'] ?? '').trim() }));
  }
  return rows.filter((r) => r.name && !/^example name$/i.test(r.name));
}

async function main() {
  const rows = loadRows();
  const plan = rows.map((r) => ({ ...r, role: mapSheetRole(r.roleLabel) }));
  const bad = plan.filter((p) => !p.role);
  if (bad.length) throw new Error(`Unknown role for: ${bad.map((b) => `${b.name} (${b.roleLabel})`).join('; ')}`);
  const emails = buildEmails(plan.map((p) => p.name));
  const users = plan.map((p, i) => ({ name: p.name, role: p.role as MisRoleName, email: emails[i] }));

  console.log(`\n${EXECUTE ? 'EXECUTE' : 'DRY RUN'} - ${users.length} users`);
  for (const u of users) console.log(`  ${u.email.padEnd(46)} ${u.role.padEnd(26)} ${u.name}`);
  if (!EXECUTE) {
    console.log('\nNothing written. Re-run with --execute to create.');
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const connectionString = process.env.RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url || !key || !connectionString) throw new Error('Missing Supabase URL/service key or DATABASE_URL in .env.local');
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const isRemote = !connectionString.includes('localhost') && !connectionString.includes('127.0.0.1');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, ssl: isRemote ? { rejectUnauthorized: false } : undefined }) });

  // Existing auth emails (paged) so an auth user with no profile is also skipped, never overwritten.
  const authEmails = new Set<string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    data.users.forEach((u) => u.email && authEmails.add(u.email.toLowerCase()));
    if (data.users.length < 200) break;
  }
  const ownerExists = (await db.misEmployee.count({ where: { role: 'OWNER', isActive: true, deletedAt: null } })) > 0;

  const dir = path.join(os.homedir(), 'golive-credentials');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const csvPath = path.join(dir, `credentials-${stamp}.csv`);
  const newFile = !fs.existsSync(csvPath);
  if (newFile) fs.writeFileSync(csvPath, 'name,role,email,temporary_password\n', { mode: 0o600 });
  fs.chmodSync(csvPath, 0o600);

  let created = 0;
  for (const u of users) {
    if (u.role === 'OWNER' && ownerExists) { console.log(`SKIP ${u.email}: an active Owner already exists`); continue; }
    if (authEmails.has(u.email) || (await db.userProfile.findFirst({ where: { email: u.email } }))) {
      console.log(`SKIP ${u.email}: already exists`);
      continue;
    }
    const password = generateTempPassword();
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { must_change_password: true },
    });
    if (error || !data.user) { console.log(`FAIL ${u.email}: ${error?.message ?? 'no user returned'}`); continue; }
    try {
      const profile = await db.userProfile.create({
        data: { authId: data.user.id, email: u.email, name: u.name, role: 'member', status: 'active' },
      });
      const code = `USR-${u.email.split('@')[0].replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 8)}-${randomBytes(2).toString('hex').toUpperCase()}`;
      await db.misEmployee.create({ data: { userProfileId: profile.id, employeeCode: code, name: u.name, role: u.role } });
    } catch (e) {
      await admin.auth.admin.deleteUser(data.user.id); // roll back only the auth user created a moment ago
      console.log(`FAIL ${u.email}: ${(e as Error).message}`);
      continue;
    }
    fs.appendFileSync(csvPath, [u.name, u.role, u.email, password].map(csvCell).join(',') + '\n');
    authEmails.add(u.email);
    created += 1;
    console.log(`OK   ${u.email} (${u.role})`);
  }
  console.log(`\nCreated ${created}. Credentials: ${csvPath} (chmod 600). Seat limit is NOT enforced by this script.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
