/**
 * D10's master data — "eleven masters, one component, zero forks".
 *
 * One table describes every master the desktop shell can list and edit: its sub-nav group, its route, the
 * fields its form has, the columns its list shows. The list component knows nothing about any master; if a
 * master ever needs a layout the component cannot express, the component changes — not that screen.
 *
 * Rules carried here (each tested):
 * - **Code is read-only after creation.** "The identity: imports match on this and history points at it, so it
 *   cannot be edited." A field marked `identity` is present and greyed on an existing row and is never part of
 *   an update.
 * - **Deactivated, never deleted.** A deactivated row stays in the data, struck through, behind a toggle whose
 *   count is on the toggle (BR-012).
 * - **A missing Hindi name says "not set"** — but ONLY for a master that has a Hindi name at all. Machines and
 *   raw materials have no such column, so none is drawn: a "not set" that can never be set would be a lie.
 * - **No money.** A raw material's price is Owner-only (D24); this directory has no price field or column.
 *
 * Pure: no Prisma, no React.
 */

import { MASTER_GROUPS, type MasterGroup } from './master-groups';

export type MasterNavGroup = 'CORE' | 'QUALITY' | 'PEOPLE' | 'OPTIONS';

export type FieldSpec = {
  key: string;
  type: 'text' | 'number' | 'select';
  /** A number that must be a whole number (a column that is an integer). */
  integer?: boolean;
  required?: boolean;
  /** Greyed on an existing row and never written by an update: the code. */
  identity?: boolean;
  /** For `select`: where the options come from. */
  options?: 'departments' | 'itemUnits' | 'severities';
};

export type MasterKey =
  | 'departments'
  | 'machines'
  | 'processes'
  | 'customers'
  | 'items'
  | 'defect-types'
  | `option-${Lowercase<MasterGroup>}`;

export type MasterSpec = {
  key: MasterKey;
  nav: MasterNavGroup;
  /** The existing route this master already lives at — D10 is the desktop half of that page. */
  href: string;
  fields: FieldSpec[];
  /** List columns after the name, in order (the code, name and status are always drawn). */
  columns: string[];
  /** Does this master have a Hindi name? */
  hasHindi: boolean;
};

const code: FieldSpec = { key: 'code', type: 'text', required: true, identity: true };
const name: FieldSpec = { key: 'name', type: 'text', required: true };
const nameHi: FieldSpec = { key: 'nameHi', type: 'text' };

const OPTION_KEYS = MASTER_GROUPS.map((g) => `option-${g.toLowerCase()}` as MasterKey);

export const MASTERS: readonly MasterSpec[] = [
  { key: 'departments', nav: 'CORE', href: '/mis/masters/departments', fields: [code, name, nameHi], columns: [], hasHindi: true },
  { key: 'machines', nav: 'CORE', href: '/mis/masters/machines', fields: [code, name, { key: 'departmentId', type: 'select', options: 'departments' }, { key: 'machineType', type: 'text' }, { key: 'capacityPerDay', type: 'number' }], columns: ['department', 'machineType'], hasHindi: false },
  { key: 'processes', nav: 'CORE', href: '/mis/masters/processes', fields: [code, name, nameHi, { key: 'departmentId', type: 'select', options: 'departments' }, { key: 'standardTimeMinutes', type: 'number', integer: true }], columns: ['department'], hasHindi: true },
  { key: 'customers', nav: 'CORE', href: '/mis/customers', fields: [code, name, nameHi, { key: 'phone', type: 'text' }, { key: 'city', type: 'text' }, { key: 'gstNo', type: 'text' }, { key: 'address', type: 'text' }], columns: ['city'], hasHindi: true },
  { key: 'items', nav: 'CORE', href: '/mis/masters/items', fields: [code, name, { key: 'unit', type: 'select', options: 'itemUnits' }, { key: 'gsm', type: 'text' }, { key: 'size', type: 'text' }, { key: 'substrate', type: 'text' }, { key: 'coating', type: 'text' }], columns: ['unit'], hasHindi: false },
  { key: 'defect-types', nav: 'QUALITY', href: '/mis/masters/defect-types', fields: [code, name, nameHi, { key: 'severity', type: 'select', required: true, options: 'severities' }], columns: ['severity'], hasHindi: true },
  ...MASTER_GROUPS.map(
    (g): MasterSpec => ({
      key: `option-${g.toLowerCase()}` as MasterKey,
      nav: 'OPTIONS',
      href: `/mis/masters/${g}`,
      fields: [{ key: 'label', type: 'text', required: true }, { key: 'labelHi', type: 'text' }],
      columns: [],
      hasHindi: true,
    }),
  ),
];

export const NAV_GROUPS: readonly MasterNavGroup[] = ['CORE', 'QUALITY', 'PEOPLE', 'OPTIONS'];

export function masterSpec(key: string): MasterSpec | null {
  return MASTERS.find((m) => m.key === key) ?? null;
}

/** The master an option-group route serves, or null for a group that does not exist. */
export function optionMasterKey(group: string): MasterKey | null {
  return (MASTER_GROUPS as readonly string[]).includes(group) ? (`option-${group.toLowerCase()}` as MasterKey) : null;
}

/** The option group behind an `option-*` master. */
export function optionGroupOf(key: MasterKey): MasterGroup | null {
  if (!key.startsWith('option-')) return null;
  return MASTER_GROUPS.find((g) => g.toLowerCase() === key.slice('option-'.length)) ?? null;
}

export const LIST_PAGE_SIZE = 50;

export type MasterCounts = { total: number; active: number; deactivated: number };

export type DirectoryEntry = { key: MasterKey; nav: MasterNavGroup; href: string; counts: MasterCounts };

/** Counts as the toggle and the header state them: `21 total · 19 active · 2 deactivated`. */
export function countsFrom(total: number, deactivated: number): MasterCounts {
  const d = Math.max(0, Math.min(deactivated, total));
  return { total, active: total - d, deactivated: d };
}

/** A missing Hindi name reads "not set": null, empty and whitespace-only all count as missing. */
export function hindiOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Case-insensitive contains over the code and the names. */
export function matchesQuery(cells: { code: string | null; name: string; nameHi: string | null }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [cells.code, cells.name, cells.nameHi].some((v) => (v ?? '').toLowerCase().includes(q));
}

/**
 * What an UPDATE may write: every field the form has except an identity field. `create` may write them all.
 * A value the form left empty is `''` — the caller decides what "empty" means per field.
 */
export function writableValues(spec: MasterSpec, values: Record<string, string>, existing: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of spec.fields) {
    if (existing && f.identity) continue;
    if (Object.prototype.hasOwnProperty.call(values, f.key)) out[f.key] = values[f.key];
  }
  return out;
}

/** The first required field that is empty, or null. The caller puts the field's LABEL in the message. */
export function missingRequired(spec: MasterSpec, values: Record<string, string>, existing: boolean): string | null {
  for (const f of spec.fields) {
    if (!f.required) continue;
    if (existing && f.identity) continue;
    if ((values[f.key] ?? '').trim() === '') return f.key;
  }
  return null;
}

export { OPTION_KEYS };

// ---------------------------------------------------------------------------
// What the screen is handed
// ---------------------------------------------------------------------------

export type MasterRowView = {
  id: string;
  code: string | null;
  name: string;
  /** null = "not set". Absent (undefined) on a master that has no Hindi name at all. */
  nameHi?: string | null;
  cells: Record<string, string | null>;
  deactivated: boolean;
  createdAt: Date;
};

export type SelectOptions = { departments: { value: string; label: string }[]; itemUnits: { value: string; label: string }[]; severities: { value: string; label: string }[] };

export type MasterListView = {
  master: MasterKey;
  counts: MasterCounts;
  showDeactivated: boolean;
  query: string;
  /** Rows after the search and the deactivated toggle, capped at LIST_PAGE_SIZE. */
  rows: MasterRowView[];
  /** How many rows matched before the cap. */
  matched: number;
  /** The row being edited (`values` is what the form starts with), or an empty create form, or null. */
  editing: null | { id: string | null; values: Record<string, string>; deactivated: boolean; createdAt: Date | null };
  options: SelectOptions;
  canWrite: boolean;
  /** A message handed back by a failed action (`?error=`), shown as an alert. Plain text, capped. */
  error: string | null;
};

export const ITEM_UNIT_VALUES = ['KG', 'LITRE', 'PIECE', 'REAM'] as const;
export const SEVERITY_VALUES = ['CRITICAL', 'MAJOR', 'MINOR'] as const;
