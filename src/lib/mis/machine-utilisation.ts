/**
 * E7-11's machine utilisation report: for a date range, how much of it each machine was booked
 * for, against an order.
 *
 * `reports.ts`'s own comment named the prerequisite: `jobPhaseId` landed on `MisMachineAllocation`
 * in Phase 9 (MIS-261/265), so an allocation can finally be read without guessing which order it
 * served — this is that report, now that the link exists.
 *
 * **What this counts, and what it does not.** "Booked" is the allocation window — `startsAt` to
 * whichever is earlier of `endsAt` and a real `releasedAt` — clipped to the report range. It is
 * not "actually running": a booked machine that sat idle mid-job still counts as booked, the same
 * reading `weeklyUtilisation` (the D5 day-timeline's own utilisation figure) already uses ("booked,
 * not actually run"). The denominator is the plain wall-clock span of the range — every hour of
 * every day in it, not a shift calendar — because `MisMachine` carries no history of when it was
 * active (F-14: "nothing records when a machine went down, or when it came back"), so a shift-
 * aware or downtime-aware percentage would claim a precision the schema cannot support. `isActive`
 * on a row is the machine's CURRENT state, shown as a caveat, never backdated onto the range.
 *
 * Pure: no Prisma, no React.
 */

export type MachineLike = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

export type AllocationLike = {
  machineId: string;
  startsAt: Date;
  endsAt: Date;
  releasedAt: Date | null;
};

export type MachineUtilisationRow = {
  machineId: string;
  code: string;
  name: string;
  /** The machine's CURRENT active flag — not a claim about the whole range (F-14). */
  isActive: boolean;
  bookedMinutes: number;
  allocationCount: number;
  /** bookedMinutes as a share of the range's wall-clock minutes, 0-100, capped at 100. */
  percent: number;
};

export type MachineUtilisationReport = {
  fromIso: string;
  toIso: string;
  availableMinutes: number;
  rows: MachineUtilisationRow[];
  totals: { bookedMinutes: number; allocationCount: number; machineCount: number };
};

/** The allocation's real end: released early beats the planned end; never later than it. */
function effectiveEnd(a: AllocationLike): Date {
  return a.releasedAt && a.releasedAt < a.endsAt ? a.releasedAt : a.endsAt;
}

export function buildMachineUtilisation(input: {
  machines: readonly MachineLike[];
  allocations: readonly AllocationLike[];
  range: { from: Date; to: Date };
}): MachineUtilisationReport {
  const { machines, allocations, range } = input;
  const availableMinutes = Math.max(0, (range.to.getTime() - range.from.getTime()) / 60000);

  const byMachine = new Map<string, { minutes: number; count: number }>();
  for (const a of allocations) {
    const from = Math.max(a.startsAt.getTime(), range.from.getTime());
    const to = Math.min(effectiveEnd(a).getTime(), range.to.getTime());
    if (to <= from) continue; // no overlap with the range at all
    const entry = byMachine.get(a.machineId) ?? { minutes: 0, count: 0 };
    entry.minutes += (to - from) / 60000;
    entry.count += 1;
    byMachine.set(a.machineId, entry);
  }

  const rows: MachineUtilisationRow[] = machines
    .map((m) => {
      const entry = byMachine.get(m.id) ?? { minutes: 0, count: 0 };
      const percent = availableMinutes > 0 ? Math.min(100, Math.round((entry.minutes / availableMinutes) * 100)) : 0;
      return { machineId: m.id, code: m.code, name: m.name, isActive: m.isActive, bookedMinutes: Math.round(entry.minutes), allocationCount: entry.count, percent };
    })
    .sort((a, b) => b.percent - a.percent || b.bookedMinutes - a.bookedMinutes || a.name.localeCompare(b.name));

  const totals = rows.reduce(
    (t, r) => ({ bookedMinutes: t.bookedMinutes + r.bookedMinutes, allocationCount: t.allocationCount + r.allocationCount, machineCount: t.machineCount + 1 }),
    { bookedMinutes: 0, allocationCount: 0, machineCount: 0 },
  );

  return { fromIso: range.from.toISOString(), toIso: range.to.toISOString(), availableMinutes: Math.round(availableMinutes), rows, totals };
}
