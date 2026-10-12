# R3-S2: Default shift, worker-allocation columns + lock index, item unit as text (schema)

Backlog: B130-B135. Branch `feat/r3-s2-people-units`. **Wave 3.** Model: Sonnet. **Opus reviews the diff** (schema + kiosk pull). Schema: **Y** (files 2 and 3 of R3-S0). Estimate: ~120 agent-min.

## Start condition (hard)
1. The owner has applied `20261014000002_r3_worker_allocation_default_shift`, and its verify SELECT passed (recorded in the tracker). File 3 (`..._r3_item_unit_text`) is applied later, right before Deploy 2 (see `R3-README.md`). Development and tests need only the regenerated client, not the live column.
2. SG is merged: schema.prisma has `MisEmployee.defaultShiftId` (+ relation `defaultShift`, back-relation on `MisShift`), `MisWorkerAllocation.releasedById/releaseReason/crewRole`, and `MisItem.unit String @default("KG")`. SG keeps `enum MisItemUnit` **declared but unused** so the existing imports still compile. You remove it (item 6).
3. `pnpm install && pnpm db:generate` works in your worktree, and `grep -n "defaultShiftId" src/generated/prisma/models/MisEmployee.ts` finds it. Otherwise STOP.

## Owned files (wave 3)
- `src/server/mis/employee.ts`, `worker-allocation.ts`, `allocation-release.ts`, `attendance-punch.ts` (clock-out hook only), `attendance.ts` (`clockOut`/`approveClockOut` hook only), `kiosk-device.ts` (pull fallback only), `item.ts`
- `src/lib/mis/item-options.ts` (switch to master-driven), NEW `src/lib/mis/crew-role.ts`
- `src/app/(mis)/mis/employees/**`, `src/app/(mis)/mis/crew/**`, `src/app/(mis)/mis/inventory/actions.ts`, `src/app/api/mis/inventory/import/route.ts`
- `src/components/mis/employees/**`, `src/components/mis/machines/**` (crew screens), `src/components/mis/inventory/inventory-screen.tsx`, `src/components/mis/items/**`
- New tests `src/server/mis/r3-s2-*.test.ts`

## Items and acceptance
1. **B130 default shift.**
   - (a) The employee form gets "Default shift" (active shifts, optional). Written by `employees.write` holders. Validated: an active shift or null. Audited as `defaultShiftId` before/after.
   - (b) The employees list shows a "Default shift" column (completes C6b #49).
   - (c) In the crew picker, people whose default shift = the selected shift are listed first and tagged "Usual shift".
   - (d) In the kiosk pull: find the field `buildPullPayload` uses today for the allocation-derived shift. When an employee has no allocation for the factory day, fill it with `defaultShiftId` (only if that shift is active). Android is unchanged.
   - (e) No change to payroll or work-date derivation.
   - Tests: (a) an inactive shift → refused, plus the audit row. (c) ordering. (d) the pull for an employee with no allocation carries the default shift; with an allocation, the allocation wins; with an inactive default, null.
2. **B132 release columns.** `releaseMachineAllocations`, `releaseWorkerRows`, `releaseWorker` and `moveWorker` persist `releasedById = ctx.actorUserId` and `releaseReason = ctx.reason` (the R3-WRK signature is unchanged). New `getWorkerAllocationHistory({ machineAllocationId? , employeeId?, fromDateKey, toDateKey })` (`production.read`, pool-scoped for employees) returns rows with assigned by / at, released by / at / reason. It appears as a "History" tab on the crew page ("Who ran Coater 1 on 12 Oct"). Tests:
   - Each reason is persisted by its path (manual, move, machine release, sign-off via the helper, order close via the helper, clock-out).
   - History pool scoping.
3. **B131 lock index.** `assignWorkers`/`moveWorker`/`copyCrew` map a P2002 on `mis_worker_allocations_open_uq` to the existing "already assigned" outcome (no error). The schema.prisma comment about the partial index belongs to SG, not to you. Test: a simulated P2002 → `alreadyAssigned` contains the employee.
4. **B133 crew role.**
   - The picker sets `crewRole` per person (default OPERATOR). At most one INCHARGE per (booking, date, shift): the app check runs inside the assign tx, giving "Coater 1 already has an in-charge (Name)". ADMIN/OWNER may replace one, which releases nothing and demotes the old INCHARGE to OPERATOR (audited).
   - The crew board and `getCrewForOrder` (as `people[].crewRole`) show the role. The job card is R3-S1's file this wave, so leave it alone: it will show the role in a later round.
   - Tests: a second INCHARGE → refused for SUPERVISOR; replace by ADMIN → old OPERATOR; the role shows in `getCrewForOrder`.
5. **B134 clock-out releases.** After a successful OUT punch (APPLIED, `dayRebuilt` or the row's `clockOut` set) and after `approveClockOut`, call `releaseWorkerRows(tx, { employeeId, allocationDate: <work date> }, { reason: 'CLOCKED_OUT', actorUserId: null for kiosk / actor for approve, at: clockOut time })` **in the same tx**. A punch replay (duplicate key) does not release twice (idempotent by `releasedAt IS NULL`). Tests: OUT → open rows for that work date released with reason CLOCKED_OUT; other dates untouched; a duplicate punch → no second write; a night shift OUT at 06:00 releases the previous work date's rows.
6. **B135 unit as text.**
   - `item.ts` `toItemUnit` accepts any **active** `UNIT` master option value (plus the stored value when unchanged), else "Unknown unit: X".
   - `unitChoices` returns all active UNIT options (the legacy-only filter is removed).
   - Import route and inventory actions use the same validation.
   - Remove every `MisItemUnit` import. Then delete the unused `enum MisItemUnit { ... }` block from `prisma/schema.prisma`: **the only schema.prisma edit allowed in this cluster**. The DB type stays for rollback. Run `pnpm db:generate`, and `grep -rn MisItemUnit src --exclude-dir=generated` is empty.
   - Tests: a new master unit `SHEETS` can be set on an item; an unknown unit → refused; existing KG items unchanged; the import with unit "Sheets" (label) maps to its value.

## Do not touch
`schema.prisma` (except the enum removal in item 6), SQL, `permissions.ts`, payroll, production/QC readers (R3-S1 owns them this wave), `machines-board.ts` (S1), Android. Keep green: `worker-allocation.test.ts`, `kiosk-device.test.ts`, `attendance-punch.test.ts`, `employee*.test.ts`, all R3-WRK tests.

## Risk notes (Opus)
B134 adds a write to the punch tx: it must not change the punch result or the idempotency outcome. B130(d) changes what the tablet pre-selects for unallocated people. Check it against the live pull with a read-only call in staging. B135 must deploy right after SQL file 3 (backlog risk 15).
