# R3-WRK: Worker allocation engine (non-schema) + machine board

Backlog: B85-B103. Branch `fix/r3-wrk`. **Wave 1.** Model: Sonnet. Schema: **N** (the columns and index are R3-S2). Estimate: ~170 agent-min. This is the largest cluster: commit per numbered group and keep the PR reviewable.
Design source: `docs/specs/audit/WRK.md` §1-§3. Owner scope: "complete worker allocation engine", "machine-board sync with production logs (warn only)", "worker hard-lock = warning with Admin override".

## Owned files
- `src/server/mis/worker-allocation.ts`, `machines-board.ts`
- NEW `src/server/mis/allocation-release.ts`. **Shared contract, frozen in this PR; consumed by R3-ORD and R3-PRD in wave 2 and R3-S2 in wave 3:**
  ```ts
  export type ReleaseReason = 'MANUAL'|'MOVED'|'PHASE_SIGNED_OFF'|'MACHINE_RELEASED'|'ORDER_CLOSED'|'CLOCKED_OUT';
  export async function releaseMachineAllocations(tx: Prisma.TransactionClient, machineAllocationIds: string[],
    ctx: { reason: ReleaseReason; actorUserId: string | null; at: Date }): Promise<{ machines: number; workers: number; workerAllocationIds: string[] }>;
  export async function releaseWorkerRows(tx: Prisma.TransactionClient, where: { ids?: string[]; machineAllocationIds?: string[]; employeeId?: string; allocationDate?: Date },
    ctx: { reason: ReleaseReason; actorUserId: string | null; at: Date }): Promise<{ workerAllocationIds: string[] }>;
  ```
  Both only touch rows with `releasedAt IS NULL` (idempotent; never re-stamp). They write `RELEASE_MACHINE` / `RELEASE_WORKER` audit rows with `after: { reason, at }`. No gate inside (callers gate).
- NEW `src/lib/mis/presence.ts` (pure): `presenceOf({ attendance: {clockIn, clockOut, status} | null, onApprovedLeave: boolean }) -> 'IN' | 'OUT' | 'LEAVE' | 'ABSENT' | 'NOT_IN'`
- NEW `src/lib/mis/machine-sync.ts` (pure): `classifyLogAgainstBookings({ machineId, orderId, at }, bookings: {machineId, orderId, startsAt, endsAt, releasedAt}[]) -> 'OK' | 'NO_BOOKING' | 'OTHER_ORDER'` (**R3-PRD consumes it**)
- NEW `src/lib/mis/crew-hours.ts` (pure): `personMinutes({ createdAt, releasedAt, clockIn, shiftStart, shiftEnd, bookingEnd, now })`
- `src/app/(mis)/mis/crew/**` (incl. NEW `crew/report/page.tsx`), `src/app/(mis)/mis/machine-board/**`, `src/app/(mis)/mis/page.tsx` (supervisor crew data only)
- `src/components/mis/machines/**` (incl. `worker-board-screen.tsx`), `src/components/mis/machine-board/**`, `src/components/mis/desktop/machine-timeline-desktop.tsx`, `src/components/mis/home/supervisor-home.tsx`
- `src/server/mis/navigation.ts` (crew entry: desktop visible; badge rule). Of the existing nav tests, **you may edit only `src/server/mis/navigation-more.test.ts`** (it encodes crew as phone-only), and only those expectations, each with a comment citing B101. `navigation.test.ts` and `bottom-nav.test.tsx` belong to R3-ATT this wave.
- New tests `src/server/mis/r3-wrk-*.test.ts`, `src/lib/mis/presence.test.ts`, `machine-sync.test.ts`, `crew-hours.test.ts`

## Read-only for you
`job-phases.ts` (R3-PRD wires the sign-off release in wave 2. Do NOT edit it), `orders.ts` (R3-ORD), `production.ts`, `attendance.ts` (read `MisAttendance`/`MisLeaveRequest` directly with Prisma; do not import or edit attendance internals), `permissions.ts`, `visibility.ts` (use `resolveVisibleEmployeeWhere`), `factory-time.ts`, schema.

## Items and acceptance
**Group A: release and ended bookings**
1. **B85** `releaseMachine(allocationId)`: unknown id → typed not-found. Already released → returns `{ alreadyReleased: true }` with no write. Otherwise it calls `releaseMachineAllocations(tx, [id], { reason: 'MACHINE_RELEASED', ... })` in one tx. Tests:
   - Release frees 3 open worker rows (`releasedAt` = the machine's).
   - A second release → `alreadyReleased`, and the timestamps are unchanged.
   - A worker row already released keeps its original `releasedAt`.
2. **B86** `getWorkerAvailability` and `getOrderSchedule`'s operator count ignore worker rows whose parent booking has `releasedAt` set or `endsAt` < the start of the selected shift window (for today: < now). Test: a booking ending 13:00, queried at 14:00 → its workers are free.

**Group B: the model**
3. **B88** a single helper `allocationDateFor(dateKey)` = `dateKeyToDbDate(dateKey)`. All of `assignWorkers`, `getWorkerAvailability`, `getCrewSummary` and copy/move take a **date key** (`YYYY-MM-DD`), never `Date`/ISO. The actions send `factoryDateKey(now, tz)` by default. Remove `atMidnight`. Exception for callers you do not own (`src/app/(mis)/mis/dashboard/page.tsx`): `getCrewSummary(date?: Date | string)` keeps accepting a `Date` and converts it with `factoryDateKey`. Test: at 2026-10-13T19:30Z (01:00 IST on the 14th) the default date key is `2026-10-14`, and the row's `allocationDate` equals the attendance date for the same day.
4. **B89** `presenceOf` drives the crew board, the picker, the summary and the badge: IN = clockIn and no clockOut; OUT = clocked out; LEAVE = an approved leave that day; ABSENT = status ABSENT; else NOT_IN. Tests: the five branches, plus "clocked out at 10:00 is not available-green".
5. **B87 several rows per person + Move.** `getWorkerAvailability` returns `allocations: {id, machineName, machineAllocationId}[]` per employee (an array). The UI lists every machine and releases per row. NEW `moveWorker({ workerAllocationId, toMachineAllocationId })` (`production.write`) in one tx: `releaseWorkerRows(..., reason 'MOVED')` + create the new row (same employee, date, shift; phase from the target booking). Tests:
   - Two open rows → both returned.
   - Move → the old row released with reason MOVED (in audit), the new row open, count unchanged.
6. **B91** `assignWorkers` runs in one `$transaction` with advisory locks `worker-<employeeId>-<dateKey>-<shiftId|none>` (sorted, via the `lockStockKeys` pattern or an equivalent helper in this file). The duplicate check and the create are inside. Audit rows after the create, inside the same tx. Test: two concurrent identical assigns → exactly one row (simulate with the fake tx and assert the lock call order). A crash mid-loop (throw on the 2nd create) → zero rows.
7. **B92 validation:**
   - `employeeIds` non-empty, each in `resolveVisibleEmployeeWhere(actor)`, role in the workable set (WORKER, QC, SUPERVISOR: read the existing constant), active, not deleted. A missing one → "Not found or not in your team: <ids>".
   - `shiftId` is an active shift.
   - The date key is valid, and today <= date <= today+7.
   - The booking window intersects that date's shift window.
   - `jobPhaseId` defaults to the booking's `jobPhaseId`. A different one → refused.
   - `releaseWorker`: open row only ("Already released"), pool-checked, writes through `releaseWorkerRows(reason 'MANUAL')`, audit has before.
   - Tests one per rule (incl. an out-of-pool id, an inactive shift, a date +8, a mismatched phase, a double release).

**Group C: staffing and the lock**
8. **B93** crew page params `?date=YYYY-MM-DD&shift=<uuid>&allocation=<uuid>` (defaults: factory today, the current shift). It lists bookings overlapping the selected shift window on that date (night shifts cross midnight: use the factory tz). It has a date picker (today..+7) and shift tabs. `allocation` opens that booking's Assign slide-over. NEW `copyCrew({ fromDateKey, toDateKey, shiftId })`: for each booking active on the target date+shift that had rows on the source date+shift **for the same booking id**, assign the same people through the same validation and lock rules. Blocked people are skipped and listed. Tests:
   - A booking at 18:00-02:00 shows under the 22:00 shift and on the right date.
   - copyCrew copies 3, skips 1 on leave.
9. **B98 hard-lock as a warning with an ADMIN override** (owner Q3 default). Conflicts per employee:
   - `OVERLAP`: an open row on another booking, same date+shift.
   - `ON_LEAVE`: an approved leave that date.
   - `NOT_IN`: only when the date is today and `presenceOf` is not IN.
   - For SUPERVISOR (and any non-ADMIN/OWNER): OVERLAP and ON_LEAVE are **blocked**. The response lists them and they are not created; the UI offers "Move here" for OVERLAP. NOT_IN is a warning, created when `confirmWarnings: true`.
   - For ADMIN/OWNER: blocked conflicts are created only with `override: { reason >= 3 }`. That appends `[override] <reason>` to the row's `notes` and writes audit `ASSIGN_WORKER_OVERRIDE` with `after: { employeeId, conflicts, reason }`.
   - Update the MIS-262 comment in `worker-allocation.ts` to say "application lock with ADMIN override (R3 B98)".
   - Tests: a matrix of role {SUPERVISOR, ADMIN} × conflict {OVERLAP, ON_LEAVE, NOT_IN} × {no flag, confirmWarnings, override} with the expected created/blocked outcome. Write it as a table-driven test.
10. **B90** crew actions (`assign`, `release`, `move`, `copy`) are wrapped in `asResult`. `worker-board-screen`:
    - Shows a result toast "Assigned N · skipped M (names)" and a per-row error.
    - The picker shows a presence chip (IN/OUT/LEAVE/NOT_IN) and sorts IN first.
    - Release uses `useConfirm`.
    - The fallback error text goes through `t()`.
    - Component tests: a toast after a partial assign; chip order.

**Group D: guards, counts, entry points**
11. **B94** crew page: `can(role,'production.read')` else render `Forbidden`. A non-UUID `?shift` → the current shift. A bad `?date` → today. Tests: ATTENDANCE_OPERATOR gets Forbidden (not error.tsx); `?shift=abc` renders.
12. **B95** the nav badge counts employees with no open row **and** `presenceOf === 'IN'`. **B96** `getOrderSchedule` operators = open rows for factory today (and the current shift when one is active). Tests.
13. **B97** `allocateMachine`:
    - Refuses `endsAt <= startsAt`, windows > 7 days, an inactive or deleted machine, an order that is closed or DRAFT, and a phase not belonging to the order.
    - Overlap check + create in one tx with an advisory lock `machine-<machineId>`.
    - Every export of `machine-board/actions.ts` is wrapped in `asResult`, and the screen shows `result.error` inline.
    - Tests: duration 0 / −2 → refused. An inactive machine → refused. Two concurrent overlapping bookings → one refused. "Machine already allocated" reaches the UI as text.
14. **B99 board sync (warn only).** `getMachineBoard` adds per machine `lastLog: { orderNumber, at } | null` (today, factory day) and `syncFlag: 'OK' | 'NO_BOOKING' | 'OTHER_ORDER' | null` from `classifyLogAgainstBookings` on today's logs (worst flag wins). The board shows an amber chip "Log without booking" / "Log for another order". Nothing is blocked. Tests: the pure helper (3 outcomes plus a released booking = NO_BOOKING), and the board flag from fixtures.
15. **B101 entry points.** The crew nav entry is visible on desktop (`phoneOnly` false). Each active machine-board row has an "Assign crew" link to `/mis/crew?date=…&shift=…&allocation=<id>` for `production.write` holders. Release on the board uses `useConfirm` with the text "Releasing frees N workers: <names>". Component tests.
16. **B100** supervisor home: the "My crew today" card adds "On machines X · Free (in) Y · Unstaffed bookings Z", linking to `/mis/crew`. Extend `getCrewSummary` (pool-scoped, factory date key, `presenceOf`). Test: fixture → expected numbers. At 00:30 IST it reads the new factory day.
17. **B102 manpower report** `/mis/crew/report?date=` (`production.read`):
    - Per shift: allocated, clocked-in (IN), idle (IN, no row), unstaffed bookings.
    - Per order/phase: person-hours = Σ `personMinutes` / 60, 1 dp, where start = max(createdAt, shiftStart, clockIn) and end = min(releasedAt ?? now, shiftEnd, bookingEnd), clamped at >= 0.
    - Names only, **no money**.
    - Tests: the pure `personMinutes` cases (advance-assigned row, released early, clock-in late, still open). The money-key scan of the report result is clean.
18. **B103** `getCrewForOrder(orderId)` (`production.read`) returns `[{ jobPhaseId, phaseName, machineName, dateKey, shiftName, people: [{ name, employeeCode, released: boolean }] }]` (names and codes only). **R3-PRD prints it on the job card.** Test: shape plus money scan.

## Do not touch
`job-phases.ts`, `orders.ts`, `production.ts`, `attendance*.ts`, `kiosk-device.ts`, schema (no `releaseReason` column yet: the reason lives in audit only until R3-S2), kit, `permissions.ts`. B88 changes argument types from `Date` to a date key. Where `worker-allocation.test.ts` passes a `Date`, change only the call argument (not the expected outcome), with a comment "R3 B88: date key". Keep green: `worker-allocation.test.ts`, `machines-board.test.ts`, `machine-day-timeline.test.ts`, `machine-utilisation-report.test.ts`, `dashboard.test.ts`.

## Risk notes
B98 changes who can confirm an overlap (backlog risk 9). The `allocation-release.ts` signature is a cross-wave contract: changing it later breaks ORD/PRD/S2. Advisory lock keys must be sorted to avoid deadlocks with `assignWorkers` running in parallel.
