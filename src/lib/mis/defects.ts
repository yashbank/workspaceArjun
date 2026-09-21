/**
 * The maths behind D14's defects report — "sorted, and cut at 80%".
 *
 * D14's rules, each a function here so it is tested as logic rather than read off a picture:
 *
 * - **The cut is drawn, not left to the reader.** Reasons are sorted by quantity with a running
 *   cumulative share; the row where it first reaches 80% is marked, with a sentence saying what that means.
 * - **Severity comes from the master, never the person.** A check's defect type is FREE TEXT (the capture
 *   screen has a plain input). Only text that matches a defect-type master by code or name — exactly, ignoring
 *   case and spacing — is classified, and its severity is the master's. Anything else is "not classified":
 *   shown as such, never guessed and never given a severity by whoever typed it.
 * - **Nothing is invented.** No disposition (reworked / scrapped / accepted with deviation), no rework
 *   time, no batch, no cost and no unit for a defect quantity is recorded, so none is computed. A rate needs
 *   output in the same unit as the defect, which is not known; machines are ranked by quantity and the screen
 *   says so.
 * - **A machine is derived, and can be unknown.** A QC check belongs to an ORDER. The machine is the booking
 *   that covered the moment of the check: one booking → that machine, several → "several machines", none →
 *   "no booking". It is counted in its own bucket, never guessed onto a machine.
 * - **The month is the factory's** (D22): a check belongs to the month of its factory-zone date.
 *
 * Pure: no Prisma, no React.
 */

import { factoryDateKey, factoryMinuteOfDay } from './factory-time';
import { isMinuteInShiftWindow } from './shift-window';

export type Severity = 'CRITICAL' | 'MAJOR' | 'MINOR';
export type DefectMaster = { id: string; code: string; name: string; severity: Severity };

export type DefectCheck = {
  id: string;
  orderId: string;
  orderNumber: string;
  checkTime: Date;
  defectType: string | null;
  defectQty: number | null;
  notes: string | null;
  parameterName: string | null;
  checkerName: string | null;
};

/** A machine booking with its real end (a released booking ends when it was released). */
export type Booking = { orderId: string; machine: string; from: Date; to: Date };
export type ShiftDef = { name: string; startTime: string; endTime: string };

export const SEVERITIES: readonly Severity[] = ['CRITICAL', 'MAJOR', 'MINOR'];
export const UNCLASSIFIED = 'UNCLASSIFIED';
export const CUT_AT = 80;

export const MULTI_MACHINE = '__several';
export const NO_MACHINE = '__none';

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

export type Reason = { key: string; label: string | null; severity: Severity | null };

/** The reason a check names, and its severity IF it is a master. `label` null = nothing was typed. */
export function resolveReason(text: string | null, masters: readonly DefectMaster[]): Reason {
  const raw = (text ?? '').trim();
  if (raw === '') return { key: '__unstated', label: null, severity: null };
  const n = norm(raw);
  const master = masters.find((m) => norm(m.code) === n || norm(m.name) === n);
  return master ? { key: `m:${master.id}`, label: master.name, severity: master.severity } : { key: `t:${n}`, label: raw.replace(/\s+/g, ' '), severity: null };
}

/** The machine that was booked to the order at the moment of the check. */
export function attributeMachine(check: Pick<DefectCheck, 'orderId' | 'checkTime'>, bookings: readonly Booking[]): string {
  const at = check.checkTime.getTime();
  const covering = new Set(bookings.filter((b) => b.orderId === check.orderId && b.from.getTime() <= at && at < b.to.getTime()).map((b) => b.machine));
  if (covering.size === 0) return NO_MACHINE;
  return covering.size === 1 ? [...covering][0] : MULTI_MACHINE;
}

/** The shift whose window holds the check's factory minute, or null when it fell outside every shift. */
export function shiftOf(at: Date, shifts: readonly ShiftDef[], timeZone: string): string | null {
  const minute = factoryMinuteOfDay(at, timeZone);
  return shifts.find((s) => isMinuteInShiftWindow(minute, s))?.name ?? null;
}

export type ReasonRow = { key: string; label: string | null; severity: Severity | null; qty: number; entries: number; share: number; cumulative: number };
export type MachineRow = { key: string; qty: number; entries: number };
export type LogRow = {
  id: string; orderId: string; orderNumber: string; dateKey: string; timeLabel: string; machine: string; reasonLabel: string | null;
  severity: Severity | null; qty: number | null; by: string | null; notes: string | null;
};

export type Drill = {
  reason: { label: string | null; qty: number; share: number };
  /** The machine holding most of that reason (a real machine, never "several" / "no booking"). */
  machine: { name: string; qty: number; shareOfReason: number } | null;
  shift: { name: string; qty: number; shareOfMachine: number } | null;
};

export type DefectReport = {
  monthKey: string;
  filters: { machine: string | null; severity: string | null };
  entries: number;
  quantity: number;
  /** Entries with no quantity typed: counted as entries, contributing 0 to every quantity. */
  withoutQuantity: number;
  severity: Record<Severity | typeof UNCLASSIFIED, number>;
  /** Each severity's share of the quantity, as a percentage (all 0 when there is no quantity). */
  severityShare: Record<Severity | typeof UNCLASSIFIED, number>;
  reasons: ReasonRow[];
  /** The share the three biggest reasons carry — only when there ARE more than three (otherwise it is trivially 100%). */
  top3Share: number | null;
  /** Index of the first reason at which the cumulative share reaches 80%; null when there are no reasons. */
  cutAfter: number | null;
  machines: MachineRow[];
  drill: Drill | null;
  log: LogRow[];
  logTotal: number;
  /** For the filters: every machine and severity present in the month BEFORE filtering. */
  available: { machines: string[]; hasMulti: boolean; hasNoMachine: boolean; severities: (Severity | typeof UNCLASSIFIED)[] };
};

const LOG_CAP = 25;

export function buildDefectReport(input: {
  checks: readonly DefectCheck[];
  masters: readonly DefectMaster[];
  bookings: readonly Booking[];
  shifts: readonly ShiftDef[];
  timeZone: string;
  monthKey: string;
  filters?: { machine?: string | null; severity?: string | null };
}): DefectReport {
  const { masters, bookings, shifts, timeZone, monthKey } = input;

  const inMonth = input.checks
    .filter((c) => factoryDateKey(c.checkTime, timeZone).slice(0, 7) === monthKey)
    .map((c) => {
      const reason = resolveReason(c.defectType, masters);
      return { check: c, reason, machine: attributeMachine(c, bookings), qty: c.defectQty !== null && Number.isFinite(c.defectQty) ? c.defectQty : 0 };
    });

  const sevOf = (r: Reason) => r.severity ?? UNCLASSIFIED;
  const available = {
    machines: [...new Set(inMonth.map((e) => e.machine).filter((m) => m !== NO_MACHINE && m !== MULTI_MACHINE))].sort(),
    hasMulti: inMonth.some((e) => e.machine === MULTI_MACHINE),
    hasNoMachine: inMonth.some((e) => e.machine === NO_MACHINE),
    severities: SEVERITIES.concat([UNCLASSIFIED as never]).filter((s) => inMonth.some((e) => sevOf(e.reason) === s)) as (Severity | typeof UNCLASSIFIED)[],
  };

  const machineFilter = input.filters?.machine ?? null;
  const severityFilter = input.filters?.severity ?? null;
  const rows = inMonth.filter((e) => (!machineFilter || e.machine === machineFilter) && (!severityFilter || sevOf(e.reason) === severityFilter));

  const quantity = rows.reduce((s, e) => s + e.qty, 0);
  const severity = { CRITICAL: 0, MAJOR: 0, MINOR: 0, [UNCLASSIFIED]: 0 } as DefectReport['severity'];
  for (const e of rows) severity[sevOf(e.reason)] += e.qty;

  // --- reasons, sorted, with the running share -------------------------------------------------
  const byReason = new Map<string, { reason: Reason; qty: number; entries: number }>();
  for (const e of rows) {
    const r = byReason.get(e.reason.key) ?? { reason: e.reason, qty: 0, entries: 0 };
    r.qty += e.qty;
    r.entries += 1;
    byReason.set(e.reason.key, r);
  }
  let running = 0;
  const reasons: ReasonRow[] = [...byReason.values()]
    .sort((a, b) => b.qty - a.qty || b.entries - a.entries || (a.reason.label ?? '').localeCompare(b.reason.label ?? ''))
    .map(({ reason, qty, entries }) => {
      running += qty;
      return { key: reason.key, label: reason.label, severity: reason.severity, qty, entries, share: quantity > 0 ? (qty / quantity) * 100 : 0, cumulative: quantity > 0 ? (running / quantity) * 100 : 0 };
    });
  const cutAfter = quantity > 0 ? reasons.findIndex((r) => r.cumulative >= CUT_AT - 1e-9) : -1;

  // --- machines, by quantity -------------------------------------------------------------------
  const byMachine = new Map<string, MachineRow>();
  for (const e of rows) {
    const m = byMachine.get(e.machine) ?? { key: e.machine, qty: 0, entries: 0 };
    m.qty += e.qty;
    m.entries += 1;
    byMachine.set(e.machine, m);
  }
  const machines = [...byMachine.values()].sort((a, b) => b.qty - a.qty || a.key.localeCompare(b.key));

  // --- the three-step drill: reason → machine → shift ------------------------------------------
  let drill: Drill | null = null;
  const top = reasons[0];
  if (top && top.qty > 0) {
    const ofTop = rows.filter((e) => e.reason.key === top.key);
    const perMachine = new Map<string, number>();
    for (const e of ofTop) if (e.machine !== NO_MACHINE && e.machine !== MULTI_MACHINE) perMachine.set(e.machine, (perMachine.get(e.machine) ?? 0) + e.qty);
    const topMachine = [...perMachine.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
    let shift: Drill['shift'] = null;
    if (topMachine) {
      const perShift = new Map<string, number>();
      for (const e of ofTop.filter((x) => x.machine === topMachine[0])) {
        const s = shiftOf(e.check.checkTime, shifts, timeZone);
        if (s) perShift.set(s, (perShift.get(s) ?? 0) + e.qty);
      }
      const topShift = [...perShift.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
      if (topShift && topMachine[1] > 0) shift = { name: topShift[0], qty: topShift[1], shareOfMachine: (topShift[1] / topMachine[1]) * 100 };
    }
    drill = {
      reason: { label: top.label, qty: top.qty, share: top.share },
      machine: topMachine ? { name: topMachine[0], qty: topMachine[1], shareOfReason: (topMachine[1] / top.qty) * 100 } : null,
      shift,
    };
  }

  // --- the log, most recent first ---------------------------------------------------------------
  const log: LogRow[] = [...rows]
    .sort((a, b) => b.check.checkTime.getTime() - a.check.checkTime.getTime())
    .slice(0, LOG_CAP)
    .map(({ check, reason, machine }) => ({
      id: check.id,
      orderId: check.orderId,
      orderNumber: check.orderNumber,
      dateKey: factoryDateKey(check.checkTime, timeZone),
      timeLabel: `${String(Math.floor(factoryMinuteOfDay(check.checkTime, timeZone) / 60)).padStart(2, '0')}:${String(factoryMinuteOfDay(check.checkTime, timeZone) % 60).padStart(2, '0')}`,
      machine,
      reasonLabel: reason.label,
      severity: reason.severity,
      qty: check.defectQty,
      by: check.checkerName,
      notes: check.notes,
    }));

  return {
    monthKey,
    filters: { machine: machineFilter, severity: severityFilter },
    entries: rows.length,
    quantity,
    withoutQuantity: rows.filter((e) => e.check.defectQty === null).length,
    severity,
    severityShare: Object.fromEntries((Object.keys(severity) as (Severity | typeof UNCLASSIFIED)[]).map((k) => [k, quantity > 0 ? (severity[k] / quantity) * 100 : 0])) as DefectReport['severityShare'],
    reasons,
    top3Share: quantity > 0 && reasons.length > 3 ? reasons[2].cumulative : null,
    cutAfter: cutAfter >= 0 ? cutAfter : null,
    machines,
    drill,
    log,
    logTotal: rows.length,
    available,
  };
}

// ---------------------------------------------------------------------------
// What the screen is handed
// ---------------------------------------------------------------------------

export type DefectReportView = DefectReport & {
  /** The factory's current month: not finished, so its figures are still growing. */
  running: boolean;
  prevKey: string;
  nextKey: string | null;
  currentKey: string;
  /** Is there a check-recording screen this person may go on to? A flag only. */
  canWrite: boolean;
};
