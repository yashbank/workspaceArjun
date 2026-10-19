/**
 * R2-102 — which leave types payroll PAYS. Pure: no Prisma, no React.
 *
 * The Owner marks each leave type PAID or UNPAID (`server/mis/leave-pay.ts`, Owner only). The choice
 * is append-only history (`MisLeavePayRule`): a payroll month is priced with the newest choice made
 * on or before that month's LAST day — the same "the figure the month will close on" rule payroll
 * already uses for HRA / allowance / bonus. A CLOSED month never moves (it reads its snapshot).
 *
 * With no choice ever made, EVERY type is unpaid: that is exactly how payroll priced a LEAVE day
 * before R2-102, so deploying this changes no payslip. The Owner then turns CL / SL / EL to Paid in
 * Settings > Leave pay (from that day's month onwards).
 */

import { LEAVE_TYPES, LEAVE_TYPE_LABEL, isLeaveType, type LeaveType } from './leave';

export const DEFAULT_LEAVE_PAY: Readonly<Record<LeaveType, boolean>> = { CL: false, SL: false, EL: false, LWP: false, OTHER: false };

export type LeavePayMap = Record<LeaveType, boolean>;

export type LeavePayRuleRow = {
  id: string;
  leaveType: string;
  paid: boolean;
  effectiveFrom: Date;
  createdAt: Date;
  reason?: string | null;
  changedById?: string | null;
};

export const MAX_LEAVE_PAY_REASON = 200;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Newest first: the later start day wins, and on the same day the later change wins. */
function newestFirst(a: LeavePayRuleRow, b: LeavePayRuleRow): number {
  const byDay = dayKey(b.effectiveFrom).localeCompare(dayKey(a.effectiveFrom));
  return byDay !== 0 ? byDay : b.createdAt.getTime() - a.createdAt.getTime();
}

/** Each leave type's PAID flag in force on `asOfKey` (YYYY-MM-DD, inclusive). */
export function leavePayAsOf(rows: readonly LeavePayRuleRow[], asOfKey: string): LeavePayMap {
  const out = { ...DEFAULT_LEAVE_PAY };
  const sorted = rows.filter((r) => isLeaveType(r.leaveType) && dayKey(r.effectiveFrom) <= asOfKey).sort(newestFirst);
  const seen = new Set<string>();
  for (const r of sorted) {
    if (seen.has(r.leaveType)) continue;
    seen.add(r.leaveType);
    out[r.leaveType as LeaveType] = r.paid;
  }
  return out;
}

/** The last calendar day of a month, as a key. */
export function monthEndKey(year: number, month: number): string {
  return dayKey(new Date(Date.UTC(year, month, 0)));
}

export type ApprovedLeave = { employeeId: string; date: Date; endDate: Date | null; leaveType: string };

/**
 * Is this employee's LEAVE day a PAID one? Only when an APPROVED leave request (the caller filters
 * the status) covers the day and its type is PAID. A LEAVE mark with no request behind it stays
 * unpaid, exactly as before R2-102.
 */
export function isPaidLeaveDay(leaves: readonly ApprovedLeave[], employeeId: string, day: Date, pay: LeavePayMap): boolean {
  const key = dayKey(day);
  return leaves.some((l) => {
    if (l.employeeId !== employeeId) return false;
    const start = dayKey(l.date);
    const end = l.endDate && dayKey(l.endDate) > start ? dayKey(l.endDate) : start;
    return start <= key && key <= end && isLeaveType(l.leaveType) && pay[l.leaveType];
  });
}

/** Why a change cannot be saved, or null. */
export function validateLeavePayChange(input: { leaveType: unknown; paid: unknown; reason?: unknown }): string | null {
  if (!isLeaveType(input.leaveType)) return 'Leave type must be CL, SL, EL, LWP or Other';
  if (typeof input.paid !== 'boolean') return 'Choose Paid or Unpaid';
  if (input.reason !== undefined && input.reason !== null && typeof input.reason !== 'string') return 'The reason must be text';
  if (typeof input.reason === 'string' && input.reason.trim().length > MAX_LEAVE_PAY_REASON) return `A reason is at most ${MAX_LEAVE_PAY_REASON} characters`;
  return null;
}

export type LeavePayView = {
  todayKey: string;
  types: { leaveType: LeaveType; label: string; paid: boolean; isDefault: boolean; since: string | null }[];
  history: { id: string; leaveType: LeaveType; label: string; paid: boolean; effectiveFrom: string; changedAt: Date; changedBy: string; reason: string | null }[];
  /** True until the R2 database update (mis_leave_pay_rules) has run: defaults show, saving is refused in words. */
  setupPending: boolean;
};

export function buildLeavePayView(
  rows: readonly LeavePayRuleRow[],
  opts: { todayKey: string; names?: ReadonlyMap<string, string>; setupPending?: boolean },
): LeavePayView {
  const valid = rows.filter((r) => isLeaveType(r.leaveType) && dayKey(r.effectiveFrom) <= opts.todayKey);
  const current = leavePayAsOf(valid, opts.todayKey);
  const types = LEAVE_TYPES.map((t) => {
    const latest = valid.filter((r) => r.leaveType === t).sort(newestFirst)[0];
    return { leaveType: t, label: LEAVE_TYPE_LABEL[t], paid: current[t], isDefault: !latest, since: latest ? dayKey(latest.effectiveFrom) : null };
  });
  const history = [...valid].sort(newestFirst).map((r) => ({
    id: r.id,
    leaveType: r.leaveType as LeaveType,
    label: LEAVE_TYPE_LABEL[r.leaveType as LeaveType],
    paid: r.paid,
    effectiveFrom: dayKey(r.effectiveFrom),
    changedAt: r.createdAt,
    changedBy: (r.changedById && opts.names?.get(r.changedById)) || 'Owner',
    reason: r.reason?.trim() ? r.reason.trim() : null,
  }));
  return { todayKey: opts.todayKey, types, history, setupPending: !!opts.setupPending };
}
