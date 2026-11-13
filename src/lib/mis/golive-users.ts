/**
 * Go-live user provisioning helpers — pure, no Prisma, no Supabase, no React.
 * Used by scripts/golive/create-users.ts; unit-tested in golive-users.test.ts.
 */
import { randomInt } from 'node:crypto';

import { validatePassword } from '@/lib/password-policy';

import type { MisRoleName } from './roles';

export const GOLIVE_EMAIL_DOMAIN = 'bpp-demo.com';

/** Lowercase words joined by '.', punctuation dropped: "D.Srinivas" -> "d.srinivas", "G.S. Joshi" -> "g.s.joshi". */
export function emailLocalPart(fullName: string): string {
  const words = fullName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.join('.');
}

/**
 * One email per name, in input order. A clash (with an earlier row or any email in `taken`)
 * gets a numeric suffix on the local part: x@, x2@, x3@ ...
 */
export function buildEmails(names: readonly string[], taken: Iterable<string> = []): string[] {
  const used = new Set<string>([...taken].map((e) => e.toLowerCase()));
  return names.map((name) => {
    const local = emailLocalPart(name);
    if (!local) throw new Error(`Cannot build an email from the name "${name}"`);
    let candidate = `${local}@${GOLIVE_EMAIL_DOMAIN}`;
    for (let n = 2; used.has(candidate); n += 1) candidate = `${local}${n}@${GOLIVE_EMAIL_DOMAIN}`;
    used.add(candidate);
    return candidate;
  });
}

/** Sheet role label (typos tolerated: "supervisior", "super Attendance") -> MIS role, or null if unknown. */
export function mapSheetRole(label: string): MisRoleName | null {
  const k = label.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  if (k === 'owner') return 'OWNER';
  if (k === 'admin' || k === 'production manager') return 'ADMIN';
  if (/^supervis/.test(k)) return 'SUPERVISOR';
  if (k === 'qc') return 'QC';
  if (/^store/.test(k)) return 'STORE_GUY';
  if (/^super\s*attendance/.test(k)) return 'SUPER_ATTENDANCE_OPERATOR';
  return null;
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';
const SPECIAL = '@#$%&*!?';

/** 14-char random password that passes the app's password policy; no look-alike characters. */
export function generateTempPassword(length = 14): string {
  const all = UPPER + LOWER + DIGIT + SPECIAL;
  const pick = (set: string) => set[randomInt(set.length)];
  for (;;) {
    const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SPECIAL)];
    while (chars.length < length) chars.push(pick(all));
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    const pw = chars.join('');
    if (validatePassword(pw).ok) return pw;
  }
}

/** CSV cell: quoted when needed, and a leading = + - @ is neutralised against spreadsheet formula injection. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export type KioskEmp = { id: string; employeeCode: string; name: string; userProfileId: string | null };
export type KioskLink =
  | { kind: 'link'; employeeId: string; employeeCode: string }
  | { kind: 'new' }
  | { kind: 'ambiguous'; reason: string };

const nameKey = (s: string | null | undefined) => (s ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

/**
 * Find the existing kiosk MisEmployee for a software user. The NAME decides (case/space-normalised); the code
 * the cleaned employee file gives that name only cross-checks it. Exactly one unlinked name match whose code
 * does not point at a different person -> link; no name match and no code row -> new. Anything else (several
 * name matches, name/code disagree, code owned by a differently named person, already linked) -> ambiguous:
 * skip and report. A code hit on a different name is never trusted (the file may reuse codes of other people).
 */
export function resolveKioskLink(name: string, emps: readonly KioskEmp[], fileCodeForName: string | null): KioskLink {
  const key = nameKey(name);
  const code = fileCodeForName ? fileCodeForName.trim().toUpperCase() : null;
  const byName = [...new Map(emps.filter((e) => nameKey(e.name) === key).map((e) => [e.id, e])).values()];
  const codeRow = code ? emps.find((e) => e.employeeCode.trim().toUpperCase() === code) : undefined;
  // Several same-name rows (a legacy test row + the freshly loaded client row): the client file's own
  // code decides, but only when that row has this exact name and no login yet.
  if (byName.length > 1 && codeRow && byName.some((e) => e.id === codeRow.id) && !codeRow.userProfileId) {
    return { kind: 'link', employeeId: codeRow.id, employeeCode: codeRow.employeeCode };
  }
  if (byName.length > 1) return { kind: 'ambiguous', reason: `${byName.length} kiosk employees match the name (${byName.map((e) => e.employeeCode).join(', ')})` };
  if (byName.length === 0) {
    return codeRow ? { kind: 'ambiguous', reason: `file code ${codeRow.employeeCode} belongs to '${codeRow.name}', a different name` } : { kind: 'new' };
  }
  const [one] = byName;
  if (codeRow && codeRow.id !== one.id) return { kind: 'ambiguous', reason: `name matches ${one.employeeCode} but file code ${codeRow.employeeCode} is '${codeRow.name}'` };
  if (one.userProfileId) return { kind: 'ambiguous', reason: `${one.employeeCode} is already linked to a user` };
  return { kind: 'link', employeeId: one.id, employeeCode: one.employeeCode };
}
