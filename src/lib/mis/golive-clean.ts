/**
 * Go-live data normalisation — pure. Mirrors `scripts/golive/clean-client-data.py`
 * (keep both in sync) and is used by `scripts/golive/load-employees.ts`.
 */

/** Trim and collapse internal whitespace. null/undefined -> "". */
export function normaliseText(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim();
}

/** Case/space-insensitive comparison key. */
export function matchKey(v: string | null | undefined): string {
  return normaliseText(v).replace(/\s+/g, '').toLowerCase();
}

const SHIFT_ALIASES: Record<string, string> = { general: 'General Shift', day: 'Day Shift', housekeeping: 'House Keeping' };

/** Resolve a sheet shift name against the real shift names; null when nothing matches. */
export function resolveShiftName(raw: string | null | undefined, shiftNames: readonly string[]): string | null {
  const k = matchKey(raw);
  if (!k) return null;
  const direct = shiftNames.find((n) => matchKey(n) === k);
  if (direct) return direct;
  const alias = SHIFT_ALIASES[k];
  return alias ? (shiftNames.find((n) => matchKey(n) === matchKey(alias)) ?? null) : null;
}

export type SystemRole = 'OWNER' | 'ADMIN' | 'SUPERVISOR' | 'QC' | 'ATTENDANCE_OPERATOR' | 'SUPER_ATTENDANCE_OPERATOR' | 'STORE_GUY';

const ROLE_MAP: Record<string, SystemRole> = {
  owner: 'OWNER',
  admin: 'ADMIN',
  'production manager': 'ADMIN',
  supervisor: 'SUPERVISOR',
  supervisior: 'SUPERVISOR',
  qc: 'QC',
  'attendance operator': 'ATTENDANCE_OPERATOR',
  'super attendance': 'SUPER_ATTENDANCE_OPERATOR',
  'super attendance operator': 'SUPER_ATTENDANCE_OPERATOR',
  store: 'STORE_GUY',
};

export function mapSheetRole(raw: string | null | undefined): SystemRole | null {
  return ROLE_MAP[normaliseText(raw).toLowerCase()] ?? null;
}

/** Fix the client's known designation typos. */
export function fixTypos(v: string): string {
  return normaliseText(v).replace(/supervisior/gi, (m) => (m[0] === 'S' ? 'Supervisor' : 'supervisor')).replace(/genral/gi, (m) => (m[0] === 'G' ? 'General' : 'general'));
}

/** MisDepartment.code for a new department: upper snake case of the name. */
export function departmentCode(name: string): string {
  return normaliseText(name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
