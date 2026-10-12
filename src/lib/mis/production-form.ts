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

/** "Name (CODE · Role)" options for the production floor only. */
export function operatorOptions(employees: OperatorSource[]): SelectChoice[] {
  return employees
    .filter((e) => e.isActive !== false && (PRODUCTION_FLOOR_ROLES as readonly string[]).includes(e.role))
    .map((e) => ({ value: e.id, label: `${e.name} (${e.employeeCode} · ${ROLE_LABEL[e.role] ?? e.role})` }));
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
