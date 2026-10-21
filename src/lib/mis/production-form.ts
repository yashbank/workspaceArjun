/**
 * Pure helpers for the production and QC entry forms (tester round 2, C5).
 * No Prisma, no React: the screens and the server pages both import this.
 */

export type SelectChoice = { value: string; label: string };

/**
 * Roles that stand at a press and can be named as the operator of a production
 * entry (#19). Everyone else (owner, admin, attendance, store, QC) is office or
 * support staff and would only clutter the picker. A filter on the dropdown only:
 * the server still accepts any employee id, so history naming someone else is safe.
 */
export const PRODUCTION_FLOOR_ROLES = ['WORKER', 'SUPERVISOR'] as const;

const ROLE_LABEL: Record<string, string> = { WORKER: 'Worker', SUPERVISOR: 'Supervisor' };

type OperatorSource = {
  id: string;
  name: string;
  employeeCode: string;
  role: string;
  isActive?: boolean;
};

export const ON_THIS_MACHINE = 'On this machine';

/**
 * Put the people booked on the chosen machine first, labelled "On this machine" (R3 B122), then
 * everyone else in their given order. Pure; `crewIds` empty leaves the list untouched.
 */
export function crewFirst(options: SelectChoice[], crewIds: readonly string[]): SelectChoice[] {
  if (crewIds.length === 0) return options;
  const crew = new Set(crewIds);
  const on = options.filter((o) => crew.has(o.value)).map((o) => ({ ...o, label: `${o.label} · ${ON_THIS_MACHINE}` }));
  return [...on, ...options.filter((o) => !crew.has(o.value))];
}

/** "Name (CODE · Role)" options for the production floor only; the machine's crew first (B122). */
export function operatorOptions(employees: OperatorSource[], crewIds: readonly string[] = []): SelectChoice[] {
  return crewFirst(
    employees
      .filter((e) => e.isActive !== false && (PRODUCTION_FLOOR_ROLES as readonly string[]).includes(e.role))
      .map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode} · ${ROLE_LABEL[e.role] ?? e.role})` })),
    crewIds,
  );
}

export const DEFAULT_PRODUCTION_UNIT = 'KG';
const FALLBACK_UNITS = ['KG', 'LITRE', 'PIECE', 'REAM'];

/**
 * Unit choices from the UNIT master group (#16). The stored value is the label
 * ("KG"), because `MisProductionLog.unit` is a plain string. KG is always offered,
 * and `keep` (a value already on screen, possibly free text from before this
 * change) is added if the master does not list it, so nothing is silently dropped.
 */
export function unitOptions(master: { label: string }[], keep?: string | null): SelectChoice[] {
  const labels = master.map((m) => m.label.trim()).filter(Boolean);
  const all = labels.length > 0 ? [...labels] : [...FALLBACK_UNITS];
  for (const extra of [DEFAULT_PRODUCTION_UNIT, keep?.trim()]) {
    if (extra && !all.some((l) => l.toLowerCase() === extra.toLowerCase())) all.push(extra);
  }
  return all.map((l) => ({ value: l, label: l }));
}

export type StageChoice = { id: string; stageName: string; seq: number };

/** "Process / BOM stage" options, in BOM order. Optional on every form. */
export function stageOptions(stages: StageChoice[]): SelectChoice[] {
  return [...stages].sort((a, b) => a.seq - b.seq).map((s) => ({ value: s.id, label: s.stageName }));
}

/** The machine to pre-select: only when the order has exactly one allocated. */
export function preselectMachine(allocatedMachineIds: string[]): string | null {
  const unique = [...new Set(allocatedMachineIds)];
  return unique.length === 1 ? unique[0] : null;
}

/** The inline, non-blocking note when the chosen machine differs from the allocated one (#39). */
export function machineMismatchNote(
  chosenId: string | null,
  allocated: { id: string; name: string }[],
): string | null {
  if (!chosenId || allocated.length === 0) return null;
  if (allocated.some((m) => m.id === chosenId)) return null;
  return `Allocated machine is ${allocated.map((m) => m.name).join(', ')}`;
}

/** The 24 h edit window for a production entry (R3 B126). Mirrors `editProductionLog` on the server. */
export const PRODUCTION_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canEditLogNow(
  log: { loggedAt: Date | string; phaseSigned?: boolean },
  orderStatus: string,
  now: Date,
): boolean {
  if (log.phaseSigned) return false;
  if (['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(orderStatus)) return false;
  return now.getTime() - new Date(log.loggedAt).getTime() <= PRODUCTION_EDIT_WINDOW_MS;
}

/** Client-side check before submit (R3 B120): qty finite > 0, waste >= 0 and <= produced. Null when fine. */
export function validateQuantities(qty: string, waste: string): string | null {
  const produced = Number(qty);
  if (qty.trim() === '' || !Number.isFinite(produced) || produced <= 0) return 'Enter a quantity produced greater than 0.';
  const w = waste.trim() === '' ? 0 : Number(waste);
  if (!Number.isFinite(w) || w < 0) return 'Waste cannot be negative.';
  if (w > produced) return 'Waste cannot be more than the quantity produced.';
  return null;
}

/** Closed orders accept no production (R3 B120). */
export function isClosedOrderStatus(status: string): boolean {
  return ['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(status);
}

/** R2-48: '' is "not recorded"; otherwise whole minutes 0..1440 (the server and DB CHECK agree). Null when fine. */
export function makereadyError(value: string): string | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 1440 ? null : 'Makeready must be whole minutes between 0 and 1440.';
}
