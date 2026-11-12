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
  if (k === 'store') return 'STORE_GUY';
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
