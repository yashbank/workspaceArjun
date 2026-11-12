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
 *
 * Kiosk link: a user whose name (or file code) matches exactly one unlinked kiosk MisEmployee is LINKED to it
 * (userProfileId set), not given a new USR- employee. Ambiguous matches are skipped and reported.
 * Gates: DB project ref (see _gate.ts, EXPECTED_DB_REF); --execute needs CONFIRM_WIPE=1; seat limit
 * (workspace_max_users, active users + pending invites) refuses unless ALLOW_SEAT_OVERRIDE=1.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { openDb } from './_gate';
import { buildEmails, csvCell, generateTempPassword, mapSheetRole, resolveKioskLink } from '../../src/lib/mis/golive-users';
import type { MisRoleName } from '../../src/lib/mis/roles';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const fileArg = process.argv.indexOf('--file');
const CLEANED = path.join(__dirname, '..', '..', 'data', 'golive', 'cleaned-users.json');
const EMP_FILE = path.join(__dirname, '..', '..', 'data', 'golive', 'cleaned-employees.json');
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

  const { prisma: db, execute: EXECUTE } = openDb(); // project-ref gate; --execute also needs CONFIRM_WIPE=1

  // Kiosk employee linking (read-only lookup).
  const kioskEmps = await db.misEmployee.findMany({ where: { deletedAt: null }, select: { id: true, employeeCode: true, name: true, userProfileId: true } });
  const fileEmps: { employeeCode: string; name: string }[] = fs.existsSync(EMP_FILE) ? JSON.parse(fs.readFileSync(EMP_FILE, 'utf8')) : [];
  const nk = (n: string) => n.replace(/\s+/g, '').toLowerCase();
  const codeByName = new Map(fileEmps.map((e) => [nk(e.name), e.employeeCode]));
  const claimed = new Set<string>();
  const links = new Map(
    users.map((u) => {
      let l = resolveKioskLink(u.name, kioskEmps, codeByName.get(nk(u.name)) ?? null);
      if (l.kind === 'link') {
        if (claimed.has(l.employeeId)) l = { kind: 'ambiguous', reason: `${l.employeeCode} already claimed by another user in this run` };
        else claimed.add(l.employeeId);
      }
      return [u.email, l] as const;
    }),
  );

  // Seats: workspace_max_users (default 15) vs active profiles + pending invites + users still to create.
  const maxRow = await db.workspaceSetting.findUnique({ where: { key: 'workspace_max_users' } });
  const maxN = Number(maxRow?.value ?? 15);
  const max = Number.isFinite(maxN) && maxN > 0 ? Math.floor(maxN) : 15;
  const [activeUsers, pendingInvites] = await Promise.all([db.userProfile.count({ where: { status: 'active' } }), db.userInvite.count({ where: { status: 'pending' } })]);
  const existingEmails = new Set((await db.userProfile.findMany({ select: { email: true } })).map((p) => p.email.toLowerCase()));
  const ownerActive = (await db.misEmployee.count({ where: { role: 'OWNER', isActive: true, deletedAt: null } })) > 0;
  const toCreate = users.filter((u) => !existingEmails.has(u.email) && !(u.role === 'OWNER' && ownerActive) && links.get(u.email)!.kind !== 'ambiguous');
  const projected = activeUsers + pendingInvites + toCreate.length;

  console.log(`\n${EXECUTE ? 'EXECUTE' : 'DRY RUN'} - ${users.length} users`);
  for (const u of users) {
    const l = links.get(u.email)!;
    const tag = l.kind === 'link' ? `LINK ${l.employeeCode}` : l.kind === 'new' ? 'NEW employee' : `SKIP ambiguous: ${l.reason}`;
    console.log(`  ${u.email.padEnd(46)} ${u.role.padEnd(26)} ${u.name}  [${tag}]`);
  }
  const nLink = users.filter((u) => links.get(u.email)!.kind === 'link').length;
  const nNew = users.filter((u) => links.get(u.email)!.kind === 'new').length;
  const nAmb = users.filter((u) => links.get(u.email)!.kind === 'ambiguous').length;
  console.log(`\nKiosk employee: link existing ${nLink}, create new ${nNew}, skipped ambiguous ${nAmb}`);
  console.log(`Seats: max_users ${max}; active ${activeUsers} + pending invites ${pendingInvites} + to create ${toCreate.length} = ${projected} -> ${projected > max ? `OVER LIMIT by ${projected - max}` : 'ok'}`);
  if (!EXECUTE) {
    console.log('\nNothing written. Re-run with --execute to create.');
    await db.$disconnect();
    return;
  }
  if (projected > max && process.env.ALLOW_SEAT_OVERRIDE !== '1') {
    console.error(`REFUSING: ${projected} seats needed but max_users is ${max}. Raise the limit or set ALLOW_SEAT_OVERRIDE=1.`);
    process.exit(1);
  }
  if (nAmb) console.log(`NOTE: ${nAmb} ambiguous user(s) will be skipped, not created.`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase URL/service key in .env.local');
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // Existing auth emails (paged) so an auth user with no profile is also skipped, never overwritten.
  const authEmails = new Set<string>();
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    data.users.forEach((u) => u.email && authEmails.add(u.email.toLowerCase()));
    if (data.users.length < 200) break;
  }
  const ownerExists = ownerActive;

  const dir = path.join(os.homedir(), 'golive-credentials');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const csvPath = path.join(dir, `credentials-${stamp}.csv`);
  const newFile = !fs.existsSync(csvPath);
  if (newFile) fs.writeFileSync(csvPath, 'name,role,email,temporary_password\n', { mode: 0o600 });
  fs.chmodSync(csvPath, 0o600);

  let created = 0;
  for (const u of users) {
    const link = links.get(u.email)!;
    if (link.kind === 'ambiguous') { console.log(`SKIP ${u.email}: kiosk employee ambiguous - ${link.reason}`); continue; }
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
      if (link.kind === 'link') {
        // Link only if still unlinked (race-safe); the kiosk row takes the software role.
        const r = await db.misEmployee.updateMany({ where: { id: link.employeeId, userProfileId: null }, data: { userProfileId: profile.id, role: u.role } });
        if (r.count !== 1) throw new Error(`kiosk employee ${link.employeeCode} was linked meanwhile`);
      } else {
        const code = `USR-${u.email.split('@')[0].replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 8)}-${randomBytes(2).toString('hex').toUpperCase()}`;
        await db.misEmployee.create({ data: { userProfileId: profile.id, employeeCode: code, name: u.name, role: u.role } });
      }
    } catch (e) {
      await db.userProfile.deleteMany({ where: { authId: data.user.id } });
      await admin.auth.admin.deleteUser(data.user.id); // roll back only the auth user created a moment ago
      console.log(`FAIL ${u.email}: ${(e as Error).message}`);
      continue;
    }
    fs.appendFileSync(csvPath, [u.name, u.role, u.email, password].map(csvCell).join(',') + '\n');
    authEmails.add(u.email);
    created += 1;
    console.log(`OK   ${u.email} (${u.role})`);
  }
  console.log(`\nCreated ${created}. Credentials: ${csvPath} (chmod 600). Seat limit was checked before creating.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
