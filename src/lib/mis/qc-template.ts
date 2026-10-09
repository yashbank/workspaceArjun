/**
 * V2 Epic 5 — the paper QC checklist, as rules.
 *
 * The form has four buttons. They map onto the `result` / `defectType` the rest of QC already
 * reads (the hourly grid, the CoA, the Supervisor's blocker card), so a checklist tap IS a QC
 * check — no second record and no new result value.
 *
 * Pure: no Prisma, no React.
 */

export const CHECKLIST_STATUSES = ['PASS', 'FAIL', 'MAKE_READY', 'PLATE_ERR'] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

export const CHECKLIST_LABELS: Record<ChecklistStatus, string> = { PASS: 'Pass', FAIL: 'Fail', MAKE_READY: 'Make Ready', PLATE_ERR: 'Plate Err' };

/** Stored as the defect type of a FAIL, so a plate error is a failure the grid turns red for. */
export const PLATE_ERROR_DEFECT = 'PLATE_ERR';

export function checklistStatusToCheck(status: ChecklistStatus): { result: 'PASS' | 'FAIL' | 'NA'; defectType?: string } {
  switch (status) {
    case 'PASS': return { result: 'PASS' };
    case 'FAIL': return { result: 'FAIL' };
    case 'PLATE_ERR': return { result: 'FAIL', defectType: PLATE_ERROR_DEFECT };
    case 'MAKE_READY': return { result: 'NA' };
  }
}

export function checkToChecklistStatus(check: { result: string; defectType: string | null }): ChecklistStatus {
  if (check.result === 'PASS') return 'PASS';
  if (check.result === 'FAIL') return check.defectType === PLATE_ERROR_DEFECT ? 'PLATE_ERR' : 'FAIL';
  return 'MAKE_READY';
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * The paper form's columns: the shift's first check at `start`, then every hour on the hour,
 * through `end` inclusive. 09:15 → 18:00 gives 09:15, 10:00, 11:00 … 18:00.
 */
export function slotTimes(start: string, end: string): string[] {
  if (!HHMM.test(start) || !HHMM.test(end)) throw new Error('Slot times must be HH:MM.');
  const from = toMin(start), to = toMin(end);
  if (to < from) throw new Error('The last slot cannot be before the first.');
  const out = [start];
  for (let m = (Math.floor(from / 60) + 1) * 60; m <= to; m += 60) out.push(toHHMM(m));
  return out;
}

export type TemplateDef = { name: string; processName: string; slotStart: string; slotEnd: string; parameters: string[] };

/** The four paper forms, as handed over. Seeded by the migration and restorable from Settings. */
export const DEFAULT_QC_TEMPLATES: readonly TemplateDef[] = [
  { name: 'Printing 6-Colours', processName: 'Printing', slotStart: '09:15', slotEnd: '18:00', parameters: ['Colour shade vs approved sample', 'Registration', 'Ink density', 'Set-off / smudging', 'Scumming / hickeys', 'Sheet count'] },
  { name: 'Lamination', processName: 'Lamination', slotStart: '09:15', slotEnd: '18:00', parameters: ['Film type & GSM', 'Bond strength (peel)', 'Bubbles / wrinkles', 'Trim alignment', 'Curl'] },
  { name: 'Lamif Flute', processName: 'Fluting', slotStart: '09:15', slotEnd: '18:00', parameters: ['Flute profile', 'Glue bond', 'Warp', 'Board thickness', 'Surface damage'] },
  { name: 'Die Cutting', processName: 'Die Cutting', slotStart: '09:15', slotEnd: '18:00', parameters: ['Die position / registration', 'Creasing depth', 'Cut cleanliness (no burr)', 'Stripping', 'Sheet count'] },
];

/** `parameters` as stored (JSON) → a clean string list. */
export function parseParameters(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
}

export type ChecklistCheck = { parameterName: string | null; slotTime: string | null; result: string; defectType: string | null; checkTime: Date };
export type ChecklistCell = { slot: string; status: ChecklistStatus | null; checks: number };
export type ChecklistRow = { parameter: string; cells: ChecklistCell[] };

/** Rows × slots, each cell the LATEST tap for that parameter in that slot. */
export function buildChecklist(parameters: string[], slots: string[], checks: ChecklistCheck[]): ChecklistRow[] {
  return parameters.map((parameter) => ({
    parameter,
    cells: slots.map((slot) => {
      const mine = checks.filter((c) => c.parameterName === parameter && c.slotTime === slot).sort((a, b) => b.checkTime.getTime() - a.checkTime.getTime());
      return { slot, status: mine[0] ? checkToChecklistStatus(mine[0]) : null, checks: mine.length };
    }),
  }));
}
