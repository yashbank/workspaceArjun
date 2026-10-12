# C5 — Production and QC forms, machine pre-fill and auto-release

Items: #16 #18 #19 #33 #39 #42 #43. Branch `fix/c5-production-qc`. Deferred (do NOT build): #17/#34 void/edit (needs schema), #40 #41 #45 (board sync from logs), #48 makeready.

## Files (grep symbols)
- Production UI: `src/components/mis/production/production-detail-screen.tsx` (~62, ~229 free-text unit; no stage field; operator select), `production-screen.tsx` (~73/95/239 machine select starts `''`; ~267-268 hardcoded "(KG)"), `src/app/(mis)/mis/production/[id]/page.tsx` (~48 maps employees to `{id,name}`), `src/components/mis/production/submit-production.ts` (offline envelope), `src/server/mis/production.ts` (`logProduction` already accepts `bomStageId` ~16), `src/lib/mis/offline/idempotency.ts` types.
- QC: `src/components/mis/qc/qc-detail-screen.tsx` (Stage shown ~221/235, no input), `src/server/mis/qc.ts` (`addQcCheck` ~22 and `recordAqlSample` ~76 already accept `bomStageId`).
- Machines: `src/server/mis/machines-board.ts` (`getMachineBoard`, `allocateMachine`, `releaseMachine` ~232), `src/server/mis/line-clearance.ts` (`currentOrderIdForMachine` ~52), `src/server/mis/job-phases.ts` (`signOffPhase` ~368-392, `reopenPhase`), `src/server/mis/master-option.ts` (`listOptions('UNIT')`, group in `lib/mis/master-groups.ts`).

## Acceptance
1. **#16** Both production forms use a unit `Select` fed by the UNIT master group (`listOptions`); default KG; `MisProductionLog.unit` stays a String (no migration); existing free-text values still display. The hardcoded "(KG)" is removed from `production-screen.tsx`.
2. **#18** A "Process / BOM stage" select (stages of that order's BOM; optional) on the production form; the value travels in `bomStageId` through the form AND the offline envelope/queue types, and is saved by the existing server path. Offline replay still works (existing idempotency tests unchanged).
3. **#19** The operator dropdown labels "Name (CODE · Role/Department)" and lists only production-floor people: roles WORKER and SUPERVISOR (exclude OWNER, ADMIN, ATTENDANCE_OPERATOR, SUPER_ATTENDANCE_OPERATOR, STORE_GUY, QC); document the filter in a comment. Do NOT touch the shared kit `Select`.
4. **#33** QC "Add check" form gets a BOM-stage select (stages of the order's BOM) and passes `bomStageId`; the table shows the stage name.
5. **#39/#43** New server helper `machineForOrder(orderId, at)` returning the machine currently allocated to the order (reads `MisMachineAllocation`, reuse the logic style of `currentOrderIdForMachine`); the production forms pre-select it when exactly one exists; choosing a different machine shows an inline (non-blocking) note "Allocated machine is X". No process-to-machine filtering.
6. **#42/#44** `signOffPhase` (inside its existing transaction) releases the machine allocation(s) linked to that phase (`releasedAt = now` when still open, using the existing release semantics in `machines-board.ts`), audit-logged; `reopenPhase` does not re-lock. The machine board shows the machine FREE afterwards (test through `getMachineBoard`).

## Do not touch
Line-clearance rules, offline idempotency core logic (only carry the optional field), kiosk, orders, GRN/store, permissions matrix, kit, schema.

## Risk notes
The offline queue replay path and signOffPhase's transaction. Run `job-phases.test.ts`, `job-phases.gate.db.test.ts` (skips without DB), `idempotency.test.ts`, `line-clearance.test.ts`, `production*.test.ts` unchanged.
