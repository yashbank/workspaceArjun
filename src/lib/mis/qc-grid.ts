/**
 * The maths behind D9's QC hourly grid — "a missing check is not a passing check".
 *
 * D9's rules, each a function here so it is tested as logic rather than read off a picture:
 *
 * - **A check is only due while the line is running.** An order's bookings (`runs`, minutes on the shift's
 *   axis) say when it was on a machine; a slot outside them is `off` ("not running") — neither missed nor
 *   upcoming. An order booked only ELSEWHERE (`runs: []`) has nothing due this shift; an order with no booking at
 *   all (`runs` undefined) has no known run window, so every slot is due (and the screen says the machine is unknown). Without this a line started at 14:00 would read as seven missed hours.
 * - **Three recorded states plus two honest absences.** A slot is `pass`, `fail`, or `makeready`
 *   (someone recorded a check and it was N/A — grey). With nothing recorded it is `never` (the slot
 *   has ended: dashed, an absence of data — MIS_UI_SPEC §4.4 rule 6) or `upcoming` (the slot is still
 *   ahead or running: not missed yet). "Not taken" is never collapsed into "fine" and never dressed as
 *   make-ready.
 * - **Columns come from the shift definition, never a hardcoded array of hours.** A nine-hour shift is
 *   nine columns, a night shift wraps midnight on one increasing axis. (`slotColumns`)
 * - **The footer is the sum of the cells.** `slots = lines × columns = pass + fail + makeready + never
 *   + upcoming`, checked in code (`identityHolds`).
 * - **A failure carries its clearance.** "A red cell with no resolution reads as an open problem
 *   forever." A failure is cleared only by a LATER PASS on the same order, stage and parameter — derived,
 *   never stored (MIS-163) — and acknowledged is not cleared.
 * - **Time is the factory's** (D22): every slot edge is minutes on the shift's own axis, and nothing
 *   here reads a server-local clock.
 *
 * Pure: no Prisma, no React.
 */

import { formatFactoryTime, factoryDateKey } from './factory-time';
import { axisLabel, axisMinute, shiftWindow } from './machine-timeline';
import { timeToMinutes } from './shift-window';

export type SlotState = 'pass' | 'fail' | 'makeready' | 'never' | 'upcoming' | 'off';

export type ShiftDef = { name: string; startTime: string; endTime: string };

export type SlotColumn = { index: number; from: number; to: number; label: string };

/** One column per started hour of the shift. 06:00–15:00 → 9; 22:00–06:00 → 8. */
export function slotColumns(shift: Pick<ShiftDef, 'startTime' | 'endTime'>): SlotColumn[] {
  const window = shiftWindow({ startMinute: timeToMinutes(shift.startTime), endMinute: timeToMinutes(shift.endTime) });
  const count = Math.max(0, Math.ceil((window.to - window.from) / 60));
  return Array.from({ length: count }, (_, index) => {
    const from = window.from + index * 60;
    return { index, from, to: Math.min(from + 60, window.to), label: axisLabel(from) };
  });
}

export type QcCheckInput = {
  id: string;
  orderId: string;
  bomStageId: string | null;
  parameterName: string | null;
  result: string;
  defectType: string | null;
  defectQty: number | null;
  notes: string | null;
  checkTime: Date;
};

export type GridOrder = {
  id: string;
  orderNumber: string;
  description: string | null;
  machines: string[];
  /**
   * Minutes on the shift's axis when the order was booked on a machine. UNDEFINED = no booking is known, so every
   * slot is due; an EMPTY list = it is booked, but not during this shift, so no slot is due.
   */
  runs?: { from: number; to: number }[];
};

export type GridCell = { state: SlotState; /** how many checks fell in this slot */ checks: number };

export type GridRow = {
  orderId: string;
  orderNumber: string;
  description: string | null;
  machines: string[];
  cells: GridCell[];
  /** Slots with a recorded check: pass + fail + make-ready. */
  taken: number;
  failed: number;
};

export type GridFailure = {
  checkId: string;
  orderId: string;
  orderNumber: string;
  machines: string[];
  parameter: string;
  slotLabel: string;
  timeLabel: string;
  defectType: string | null;
  defectQty: number | null;
  notes: string | null;
  /** Factory time of the later PASS that cleared it (`dd/mm hh:mm` when on another day); null = still open. */
  cleared: string | null;
};

export type GridMissed = { orderId: string; orderNumber: string; machines: string[]; slotLabel: string };

export type QcGrid = {
  columns: SlotColumn[];
  rows: GridRow[];
  totals: { lines: number; columns: number; slots: number; pass: number; fail: number; makeready: number; never: number; upcoming: number; off: number; taken: number };
  /** pass + fail + makeready + never + upcoming + off === lines × columns. False means a bug, never a fact. */
  identityHolds: boolean;
  failures: GridFailure[];
  missed: GridMissed[];
};

const resultKind = (result: string): 'pass' | 'fail' | 'makeready' => (result === 'PASS' ? 'pass' : result === 'FAIL' ? 'fail' : 'makeready');

/** Fail beats pass beats make-ready — one bad check makes the hour red. */
const RANK = { fail: 3, pass: 2, makeready: 1 } as const;

export function buildQcGrid(input: {
  orders: readonly GridOrder[];
  checks: readonly QcCheckInput[];
  shift: Pick<ShiftDef, 'startTime' | 'endTime'>;
  dateKey: string;
  timeZone: string;
  now: Date;
}): QcGrid {
  const { orders, checks, shift, dateKey, timeZone, now } = input;
  const columns = slotColumns(shift);
  const nowAxis = axisMinute(now, dateKey, timeZone);
  const machinesOf = new Map(orders.map((o) => [o.id, o.machines]));
  const numberOf = new Map(orders.map((o) => [o.id, o.orderNumber]));

  // Which slot each check falls in, on the shift's own axis. Outside the window: not in this grid.
  const placed = checks
    .map((check) => ({ check, axis: axisMinute(check.checkTime, dateKey, timeZone) }))
    .map((p) => ({ ...p, slot: columns.find((c) => p.axis >= c.from && p.axis < c.to) }))
    .filter((p): p is typeof p & { slot: SlotColumn } => p.slot !== undefined);

  const rows: GridRow[] = orders
    .map((order): GridRow => {
      const mine = placed.filter((p) => p.check.orderId === order.id);
      const cells: GridCell[] = columns.map((col) => {
        const inSlot = mine.filter((p) => p.slot.index === col.index);
        if (inSlot.length === 0) {
          const running = order.runs === undefined || order.runs.some((r) => r.from < col.to && r.to > col.from);
          if (!running) return { state: 'off', checks: 0 };
          return { state: col.to <= nowAxis ? 'never' : 'upcoming', checks: 0 };
        }
        const state = inSlot.map((p) => resultKind(p.check.result)).reduce((best, k) => (RANK[k] > RANK[best] ? k : best));
        return { state, checks: inSlot.length };
      });
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        description: order.description,
        machines: order.machines,
        cells,
        taken: cells.filter((c) => c.state === 'pass' || c.state === 'fail' || c.state === 'makeready').length,
        failed: cells.filter((c) => c.state === 'fail').length,
      };
    })
    .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));

  // --- the footer is the sum of the cells -------------------------------------------------
  const totals = { lines: rows.length, columns: columns.length, slots: rows.length * columns.length, pass: 0, fail: 0, makeready: 0, never: 0, upcoming: 0, off: 0, taken: 0 };
  for (const row of rows) for (const cell of row.cells) totals[cell.state] += 1;
  totals.taken = totals.pass + totals.fail + totals.makeready;
  const identityHolds = totals.pass + totals.fail + totals.makeready + totals.never + totals.upcoming + totals.off === totals.slots;

  // --- failures, each with its clearance ---------------------------------------------------
  const cleared = (fail: QcCheckInput): string | null => {
    const later = checks
      .filter(
        (c) =>
          c.orderId === fail.orderId &&
          c.bomStageId === fail.bomStageId &&
          (c.parameterName ?? 'General') === (fail.parameterName ?? 'General') &&
          c.result === 'PASS' &&
          c.checkTime.getTime() > fail.checkTime.getTime(),
      )
      .sort((a, b) => a.checkTime.getTime() - b.checkTime.getTime())[0];
    if (!later) return null;
    const time = formatFactoryTime(later.checkTime, timeZone);
    const sameDay = factoryDateKey(later.checkTime, timeZone) === factoryDateKey(fail.checkTime, timeZone);
    return sameDay ? time : `${factoryDateKey(later.checkTime, timeZone).slice(8, 10)}/${factoryDateKey(later.checkTime, timeZone).slice(5, 7)} ${time}`;
  };

  const failures: GridFailure[] = placed
    .filter((p) => p.check.result === 'FAIL')
    .sort((a, b) => a.check.checkTime.getTime() - b.check.checkTime.getTime())
    .map(({ check, slot }) => ({
      checkId: check.id,
      orderId: check.orderId,
      orderNumber: numberOf.get(check.orderId) ?? '—',
      machines: machinesOf.get(check.orderId) ?? [],
      parameter: check.parameterName ?? 'General',
      slotLabel: slot.label,
      timeLabel: formatFactoryTime(check.checkTime, timeZone),
      defectType: check.defectType,
      defectQty: check.defectQty,
      notes: check.notes,
      cleared: cleared(check),
    }));

  const missed: GridMissed[] = rows.flatMap((row) =>
    row.cells.flatMap((cell, i) => (cell.state === 'never' ? [{ orderId: row.orderId, orderNumber: row.orderNumber, machines: row.machines, slotLabel: columns[i].label }] : [])),
  );

  return { columns, rows, totals, identityHolds, failures, missed };
}

// ---------------------------------------------------------------------------
// What the screen is handed
// ---------------------------------------------------------------------------

export type AqlSeverityLine = { severity: string; found: number; max: number; exceeded: boolean };

/**
 * The latest AQL decision in the shift. `limits` — the thresholds and every `found / max` line — is
 * present ONLY for a role holding `aql.read` (D6: AQL thresholds are the Owner's). For everyone else the
 * key is ABSENT: they get the verdict and the sample they took, never the limits it was judged against.
 */
export type QcAqlPanel = {
  orderNumber: string;
  decision: 'ACCEPT' | 'REJECT';
  sampleSize: number | null;
  timeLabel: string;
  limits?: { sampleSizeRequired: number | null; sampleSizeMet: boolean | null; breakdown: AqlSeverityLine[] };
};

export type QcGridView = {
  shifts: { id: string; name: string; startTime: string; endTime: string }[];
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
  dateKey: string | null;
  todayKey: string;
  /** running: inside the shift now · closed: it has ended · upcoming: it has not begun. */
  status: 'running' | 'closed' | 'upcoming' | null;
  grid: QcGrid | null;
  aql: QcAqlPanel | null;
  canWrite: boolean;
};
