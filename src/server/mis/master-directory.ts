/**
 * D10's master data: every master's counts, list and edit through ONE set of functions.
 *
 * This is the desktop half of the pages that already exist, so it reuses their server functions: a list is
 * `listMachines` / `listDepts` / `listProcesses` / `listCustomers` / `listItems` / `listDefectTypes` /
 * `listOptions`, a save is `createX` / `updateX`, a deactivation is `deleteX` and a reactivation is
 * `restoreX`. Those hold the permission check and the audit write for every change; the functions here only
 * add a gate of their own on top (so a refused role costs no query), pick the right one, and shape the answer.
 *
 * **Code is read-only after creation**: an update never carries it (`writableValues`).
 * **No money.** A raw material's price is Owner-only (D24); this module never selects or returns it, and
 * `listItems` already drops it for a role without `wages.read` (F-06).
 */

import {
  ITEM_UNIT_VALUES,
  LIST_PAGE_SIZE,
  SEVERITY_VALUES,
  countsFrom,
  hindiOrNull,
  masterSpec,
  matchesQuery,
  missingRequired,
  optionGroupOf,
  writableValues,
  MASTERS,
  type DirectoryEntry,
  type MasterKey,
  type MasterListView,
  type MasterRowView,
  type MasterSpec,
} from '@/lib/mis/master-directory';
import { can } from '@/lib/mis/permissions';
import { db } from '@/server/db';
import { requirePermission } from '@/server/mis/auth';

import { createCustomer, deleteCustomer, listCustomers, restoreCustomer, updateCustomer } from './customer';
import { createDefectType, deleteDefectType, listDefectTypes, restoreDefectType, updateDefectType } from './defect-type';
import { createDept, deleteDept, listDepts, restoreDept, updateDept } from './department';
import { createItem, deleteItem, listItems, restoreItem, updateItem } from './item';
import { createMachine, deleteMachine, listMachines, restoreMachine, updateMachine } from './machine';
import { createOption, deleteOption, listOptions, restoreOption, updateOption } from './master-option';
import { createProcess, deleteProcess, listProcesses, restoreProcess, updateProcess } from './process';

type Raw = Record<string, unknown> & { id: string; deletedAt: Date | null; createdAt: Date };

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));
const optional = (v: string | undefined): string | null => (v === undefined || v.trim() === '' ? null : v.trim());
const num = (v: string | undefined, field: string, whole = false): number | null => {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be a number, zero or more.`);
  if (whole && !Number.isInteger(n)) throw new Error(`${field} must be a whole number.`);
  return n;
};
const dept = (r: Raw) => (r.department as { name: string } | null)?.name ?? null;

type Adapter = {
  list: (includeDeleted: boolean) => Promise<Raw[]>;
  row: (r: Raw) => { code: string | null; name: string; nameHi?: string | null; cells: Record<string, string | null> };
  form: (r: Raw) => Record<string, string>;
  create: (v: Record<string, string>) => Promise<unknown>;
  update: (id: string, v: Record<string, string>) => Promise<unknown>;
  deactivate: (id: string) => Promise<unknown>;
  reactivate: (id: string) => Promise<unknown>;
};

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function adapterFor(key: MasterKey): Adapter {
  switch (key) {
    case 'departments':
      return {
        list: (d) => listDepts(d) as Promise<Raw[]>,
        row: (r) => ({ code: str(r.code), name: String(r.name), nameHi: hindiOrNull(r.nameHi), cells: {} }),
        form: (r) => ({ code: s(r.code), name: s(r.name), nameHi: s(r.nameHi) }),
        create: (v) => createDept({ code: v.code, name: v.name, nameHi: optional(v.nameHi) }),
        update: (id, v) => updateDept(id, { name: v.name, nameHi: optional(v.nameHi) }),
        deactivate: deleteDept,
        reactivate: restoreDept,
      };
    case 'machines':
      return {
        list: (d) => listMachines(d) as Promise<Raw[]>,
        row: (r) => ({ code: str(r.code), name: String(r.name), cells: { department: dept(r), machineType: str(r.machineType) } }),
        form: (r) => ({ code: s(r.code), name: s(r.name), departmentId: s(r.departmentId), machineType: s(r.machineType), capacityPerDay: r.capacityPerDay == null ? '' : String(Number(r.capacityPerDay)) }),
        create: (v) => createMachine({ code: v.code, name: v.name, departmentId: optional(v.departmentId), machineType: optional(v.machineType), capacityPerDay: num(v.capacityPerDay, 'Capacity per day') }),
        update: (id, v) => updateMachine(id, { name: v.name, departmentId: optional(v.departmentId), machineType: optional(v.machineType), capacityPerDay: num(v.capacityPerDay, 'Capacity per day') }),
        deactivate: deleteMachine,
        reactivate: restoreMachine,
      };
    case 'processes':
      return {
        list: (d) => listProcesses(d) as Promise<Raw[]>,
        row: (r) => ({ code: str(r.code), name: String(r.name), nameHi: hindiOrNull(r.nameHi), cells: { department: dept(r) } }),
        form: (r) => ({ code: s(r.code), name: s(r.name), nameHi: s(r.nameHi), departmentId: s(r.departmentId), standardTimeMinutes: s(r.standardTimeMinutes) }),
        create: (v) => createProcess({ code: v.code, name: v.name, nameHi: optional(v.nameHi), departmentId: optional(v.departmentId), standardTimeMinutes: num(v.standardTimeMinutes, 'Standard time', true) }),
        update: (id, v) => updateProcess(id, { name: v.name, nameHi: optional(v.nameHi), departmentId: optional(v.departmentId), standardTimeMinutes: num(v.standardTimeMinutes, 'Standard time', true) }),
        deactivate: deleteProcess,
        reactivate: restoreProcess,
      };
    case 'customers':
      return {
        list: (d) => listCustomers(d) as Promise<Raw[]>,
        row: (r) => ({ code: str(r.code), name: String(r.name), nameHi: hindiOrNull(r.nameHi), cells: { city: str(r.city) } }),
        form: (r) => ({ code: s(r.code), name: s(r.name), nameHi: s(r.nameHi), phone: s(r.phone), city: s(r.city), gstNo: s(r.gstNo), address: s(r.address) }),
        create: (v) => createCustomer({ code: v.code, name: v.name, nameHi: optional(v.nameHi), phone: optional(v.phone), city: optional(v.city), gstNo: optional(v.gstNo), address: optional(v.address) }),
        update: (id, v) => updateCustomer(id, { name: v.name, nameHi: optional(v.nameHi), phone: optional(v.phone), city: optional(v.city), gstNo: optional(v.gstNo), address: optional(v.address) }),
        deactivate: deleteCustomer,
        reactivate: restoreCustomer,
      };
    case 'items':
      return {
        // The price is deliberately not in any row or form here (D24).
        list: (d) => listItems(d) as Promise<Raw[]>,
        row: (r) => ({ code: str(r.code), name: String(r.name), cells: { unit: str(r.unit) } }),
        form: (r) => ({ code: s(r.code), name: s(r.name), unit: s(r.unit), gsm: s(r.gsm), size: s(r.size), substrate: s(r.substrate), coating: s(r.coating) }),
        create: (v) => createItem({ code: v.code, name: v.name, unit: optional(v.unit) ?? undefined, gsm: optional(v.gsm), size: optional(v.size), substrate: optional(v.substrate), coating: optional(v.coating) }),
        update: (id, v) => updateItem(id, { name: v.name, unit: optional(v.unit) ?? undefined, gsm: optional(v.gsm), size: optional(v.size), substrate: optional(v.substrate), coating: optional(v.coating) }),
        deactivate: deleteItem,
        reactivate: restoreItem,
      };
    case 'defect-types':
      return {
        list: (d) => listDefectTypes(d) as Promise<Raw[]>,
        row: (r) => ({ code: str(r.code), name: String(r.name), nameHi: hindiOrNull(r.nameHi), cells: { severity: str(r.severity) } }),
        form: (r) => ({ code: s(r.code), name: s(r.name), nameHi: s(r.nameHi), severity: s(r.severity) }),
        create: (v) => createDefectType({ code: v.code, name: v.name, nameHi: optional(v.nameHi), severity: v.severity as never }),
        update: (id, v) => updateDefectType(id, { name: v.name, nameHi: optional(v.nameHi), severity: v.severity as never }),
        deactivate: deleteDefectType,
        reactivate: restoreDefectType,
      };
    default: {
      const group = optionGroupOf(key);
      if (!group) throw new Error(`Unknown master: ${key}`);
      return {
        list: (d) => listOptions(group, d) as Promise<Raw[]>,
        row: (r) => ({ code: null, name: String(r.label), nameHi: hindiOrNull(r.labelHi), cells: {} }),
        form: (r) => ({ label: s(r.label), labelHi: s(r.labelHi) }),
        create: (v) => createOption({ group, label: v.label, labelHi: optional(v.labelHi) }),
        update: (id, v) => updateOption(id, { label: v.label, labelHi: optional(v.labelHi) }),
        deactivate: deleteOption,
        reactivate: restoreOption,
      };
    }
  }
}

async function countsFor(spec: MasterSpec) {
  const group = optionGroupOf(spec.key);
  const scope = group ? { group } : {};
  const model = (
    {
      departments: db.misDepartment,
      machines: db.misMachine,
      processes: db.misProcess,
      customers: db.misCustomer,
      items: db.misItem,
      'defect-types': db.misDefectType,
    } as Record<string, { count: (a?: object) => Promise<number> }>
  )[spec.key] ?? db.misMasterOption;
  const [total, deactivated] = await Promise.all([model.count({ where: scope }), model.count({ where: { ...scope, deletedAt: { not: null } } })]);
  return countsFrom(total, deactivated);
}

/** Every master with its counts — the sub-nav. One count pair per master; no row is loaded. */
export async function getMasterDirectory(): Promise<DirectoryEntry[]> {
  await requirePermission('masters.read');
  return Promise.all(MASTERS.map(async (m) => ({ key: m.key, nav: m.nav, href: m.href, counts: await countsFor(m) })));
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The words a person sees on the form, for an error that names a field. */
const FIELD_LABELS: Record<string, string> = { code: 'Code', name: 'Name', label: 'Name', severity: 'Severity' };

export async function getMasterList(
  masterKey: unknown,
  input: { q?: unknown; deactivated?: unknown; edit?: unknown; create?: unknown; error?: unknown } = {},
): Promise<MasterListView> {
  const actor = await requirePermission('masters.read');
  const spec = typeof masterKey === 'string' ? masterSpec(masterKey) : null;
  if (!spec) throw new Error('Unknown master');

  const adapter = adapterFor(spec.key);
  const showDeactivated = input.deactivated === '1' || input.deactivated === true;
  const query = asString(input.q).trim();
  const canWrite = can(actor.role, 'masters.write');

  const [all, departments] = await Promise.all([
    adapter.list(true),
    spec.fields.some((f) => f.options === 'departments') ? listDepts(false) : Promise.resolve([]),
  ]);

  const counts = countsFrom(all.length, all.filter((r) => r.deletedAt !== null).length);
  const rows: MasterRowView[] = all
    .filter((r) => showDeactivated || r.deletedAt === null)
    .map((r) => ({ id: r.id, ...adapter.row(r), deactivated: r.deletedAt !== null, createdAt: r.createdAt }))
    .filter((r) => matchesQuery({ code: r.code, name: r.name, nameHi: r.nameHi ?? null }, query));

  // A master with no Hindi name has no `nameHi` key at all (never `null`, which would read "not set").
  const shaped = rows.map((r) => (spec.hasHindi ? r : (({ nameHi: _n, ...rest }) => (void _n, rest))(r)));

  const editId = asString(input.edit);
  const target = editId ? all.find((r) => r.id === editId) ?? null : null;
  let editing: MasterListView['editing'] = null;
  if (canWrite && target) editing = { id: target.id, values: adapter.form(target), deactivated: target.deletedAt !== null, createdAt: target.createdAt };
  else if (canWrite && input.create === '1') editing = { id: null, values: Object.fromEntries(spec.fields.map((f) => [f.key, ''])), deactivated: false, createdAt: null };

  return {
    master: spec.key,
    counts,
    showDeactivated,
    query,
    rows: shaped.slice(0, LIST_PAGE_SIZE),
    matched: shaped.length,
    editing,
    options: {
      departments: (departments as { id: string; name: string }[]).map((d) => ({ value: d.id, label: d.name })),
      itemUnits: ITEM_UNIT_VALUES.map((v) => ({ value: v, label: v })),
      severities: SEVERITY_VALUES.map((v) => ({ value: v, label: v })),
    },
    canWrite,
    error: asString(input.error).trim().slice(0, 200) || null,
  };
}

/**
 * Create or update one master row. An update carries no code (read-only after creation). The underlying
 * `createX` / `updateX` hold their own permission check and audit write.
 */
export async function saveMaster(masterKey: unknown, id: string | null, values: Record<string, string>): Promise<void> {
  await requirePermission('masters.write');
  const spec = typeof masterKey === 'string' ? masterSpec(masterKey) : null;
  if (!spec) throw new Error('Unknown master');

  const existing = id !== null;
  const missing = missingRequired(spec, values, existing);
  if (missing) throw new Error(`${FIELD_LABELS[missing] ?? missing} is required.`);
  const writable = writableValues(spec, values, existing);

  const adapter = adapterFor(spec.key);
  if (existing) await adapter.update(id, writable);
  else await adapter.create(writable);
}

/** Deactivate (never delete) or reactivate one row. */
export async function setMasterDeactivated(masterKey: unknown, id: string, deactivated: boolean): Promise<void> {
  await requirePermission('masters.write');
  const spec = typeof masterKey === 'string' ? masterSpec(masterKey) : null;
  if (!spec) throw new Error('Unknown master');
  const adapter = adapterFor(spec.key);
  const row = (await adapter.list(true)).find((r) => r.id === id);
  if (!row) throw new Error('That row no longer exists.');
  // Already in the state asked for: nothing to do, and nothing re-stamped or re-audited.
  if ((row.deletedAt !== null) === deactivated) return;
  if (deactivated) await adapter.deactivate(id);
  else await adapter.reactivate(id);
}
