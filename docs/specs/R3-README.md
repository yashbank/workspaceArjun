# R3: Audit fixes + owner scope: waves, rules, gates, deploy (2026-10-13)

Inputs: `docs/specs/audit/{STK,ORD,SEC,ATT,WRK}.md` (123 findings) and the owner-approved R3 scope. Deduped and ranked in **`R3-backlog.md`** (118 kept, 5 dropped, 3 owner questions with defaults; none blocking). R2 (`00-README.md`, C1-C7) is merged and its rules still apply unless changed below.
**Line numbers drift: grep the symbol.** If a spec claim is false in code, say so in the PR and skip it.

## Clusters
| Cluster | Spec | Branch | Wave | Depends on | Model | Opus review | Schema | Est. min |
|---|---|---|---|---|---|---|---|---|
| R3-STK stock/GRN/receipt | `R3-stk.md` | `fix/r3-stk` | 1 | — | Sonnet | yes (stock, money) | N | 150 |
| R3-MST masters/codes/units/PO/parties | `R3-mst.md` | `fix/r3-mst` | 1 | — | Sonnet | `po.ts` rate hunk | N | 100 |
| R3-SEC security + payroll money | `R3-sec.md` | `fix/r3-sec` | 1 | — | Sonnet | yes (money, roles) | N | 150 |
| R3-ATT attendance/kiosk server/permissions | `R3-att.md` | `fix/r3-att` | 1 | — | Sonnet | `permissions.ts` + window hunks | N | 140 |
| R3-QCR QC/CoA/reports/legacy report | `R3-qcr.md` | `fix/r3-qcr` | 1 | — | Sonnet | — | N | 120 |
| R3-WRK worker engine + machine board | `R3-wrk.md` | `fix/r3-wrk` | 1 | — | Sonnet | — | N | 170 |
| R3-AND Android kiosk | `R3-and.md` | `fix/r3-and` | 1 | (consumes optional ATT fields) | Sonnet | — | N (Room migrations) | 120 |
| R3-S0 SQL authoring (step) | `R3-S0-sql.md` | `chore/r3-s0-sql` | 1 | — | Sonnet | yes (SQL) | SQL only | 30 |
| R3-ORD orders/BOM/approvals | `R3-ord.md` | `fix/r3-ord` | 2 | WRK (`allocation-release.ts`) | Sonnet | B104 hunk | N | 110 |
| R3-PRD production/phases/queue/job card | `R3-prd.md` | `fix/r3-prd` | 2 | WRK, QCR (`qty-by-unit.ts`) | Sonnet | — | N | 130 |
| SG schema.prisma gate (step) | this file §SG | `chore/r3-schema` | after SQL apply | owner applied S0 SQL | Haiku | yes | Y | 15 |
| R3-S1 void + makeready | `R3-S1-void-makeready.md` | `feat/r3-s1-void-makeready` | 3 | SG | Sonnet | yes | Y | 120 |
| R3-S2 default shift + allocation cols + unit text | `R3-S2-people-units.md` | `feat/r3-s2-people-units` | 3 | SG | Sonnet | yes | Y | 120 |

There are 11 build clusters plus 2 short steps. Wave 1 is 7 clusters plus S0. To protect the shared rate budget (`mis-fast-phase`), run it as **1a: STK, SEC, WRK, S0**, then **1b: MST, ATT, QCR, AND**. File ownership is disjoint, so the order inside a wave does not matter.

## File ownership (disjoint per wave)
Each spec lists its **Owned files**. Editing any file not on your list (other than new test files with your cluster prefix) means **stop and report**. Reading is always fine. A file may change owner between waves; the earlier wave is merged first. Cross-cluster **contracts frozen in wave 1** (do not change their signatures afterwards):
- `src/server/mis/allocation-release.ts`: `releaseMachineAllocations`, `releaseWorkerRows`, `ReleaseReason` (WRK → ORD, PRD, S2)
- `src/lib/mis/machine-sync.ts`: `classifyLogAgainstBookings` (WRK → PRD)
- `src/lib/mis/presence.ts`: `presenceOf` (WRK → PRD, S2)
- `worker-allocation.ts`: `getCrewForOrder` (WRK → PRD, S2)
- `src/lib/mis/qty-by-unit.ts`: `sumByUnit` (QCR → PRD)
- `order-transitions.ts`: `evaluateCloseGates` stays backward compatible (ORD adds only an optional field)
- `inventory.ts`: `adjustInventory(itemId, changeQty, notes?)` shape unchanged (STK ↔ MST)
- Kiosk JSON: pull `factoryTimezone?`, punch `workDate?`, `note?`, 413 `PAYLOAD_TOO_LARGE` (ATT → AND)

## Global rules (every implementation agent; adapted from `00-README.md`)
1. Read `.claude/agents/mis-orchestrator.md`, `docs/MIS_UI_SPEC.md`, this file, then ONLY your cluster spec (and `R3-backlog.md` rows it cites). Do not explore beyond the files named. Grep, don't browse.
2. One cluster = one worktree = one branch off `origin/phase-a` = one PR into `phase-a`. Never merge, never push to `main`.
3. **Test first:** write the failing test that reproduces each item, then fix. Colocated `*.test.ts`. Never edit an existing test to make it pass. The only exception is an old test that encodes the changed contract: change only that expectation, with a comment citing the backlog id, and list it in the PR.
4. While iterating, run ONLY your tests (`pnpm vitest run <files>`). Before the final commit: `node_modules/.bin/tsc --noEmit --skipLibCheck` (silent) and eslint on touched files. The orchestrator runs the full suite and the build per wave.
5. Do NOT edit: `src/components/mis/kit/*`, `src/server/mis/audit.ts`, `src/generated/**`, `prisma/schema.prisma` (only SG; plus S2's single enum removal), `prisma/migrations*/**` (only S0/SG), `src/lib/mis/permissions.ts` (only R3-ATT), `(auth)` and `(dashboard)` routes, `mis-kiosk-android/` (only R3-AND), `docs/COMPLETION_TRACKER.md` (only the orchestrator).
6. **Schema:** waves 1-2 write no TypeScript that references a new column or model. Wave 3 starts only after the SQL is applied **and** SG is merged **and** `pnpm db:generate` shows the fields. If any of these is missing, stop; never work around it with `any` or raw SQL.
7. **Money** (wages, rates, prices, invoice amounts, stock value) is OWNER-only: redacted server-side, never in props, never in audit `before/after` for other roles. Any change touching roles or money follows `mis-permission-matrix` (8-role table test, recursive money-key scan, `MIS_ROLES` completeness).
8. **Reuse before writing:** `asResult`/`unwrap`/`mapPrismaError` (`action-result.ts`), `requirePermission` (the actor carries `role`; role checks use it, never a client flag), `logAuditEvent`, `lockStockKeys`, `withoutRates`, `can()`, `resolveVisibleEmployeeWhere`, `safeHref`, kit `Select/Input/Button/SlideOver/EmptyState`, `src/components/ui` confirm-dialog (`useConfirm`)/toast, `PageBack`, `factory-time.ts` (`factoryDateKey`, `dateKeyToDbDate`, `formatFactory*`, `friendlyWhen`). Plus the new R3 shared helpers listed under contracts.
9. **Time is the factory's** (`factory-time.ts`). No `toLocale*`, `getHours`, `setHours`, `getFullYear` or `new Date(y,m,d)` in MIS server code or screens you touch.
10. **Every user-reachable server action returns `ActionResult`** and the screen shows `result.error`. Never the error boundary for an expected refusal.
11. Commit trailer: the one in your session's attribution reminder. The PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
12. Work in a single pass per `mis-fast-phase`: no sub-agents, batch edits, tsc/vitest incrementally, no `pnpm build`.
13. Final report under 200 words: per backlog id fixed / not-real / deferred, new test count, existing tests whose expectation you changed (with reason), what you could not verify, PR link.

## Per-wave gate (orchestrator)
1. Each PR: tsc silent, the cluster's tests green, eslint clean on touched files, test count only goes up, the owned-files diff check (`gh pr diff --name-only` ⊆ owned list + new tests). A violation → send back.
2. Opus review for the PRs flagged in the table (read the money/stock/schema hunks and every edited existing test).
3. Merge the wave's PRs into `phase-a`, then on the merged head: `pnpm install && pnpm db:generate`, tsc, `pnpm test` (>= previous total), `eslint src e2e`, `pnpm build`.
4. Contract check before the next wave: `grep -n "export async function releaseMachineAllocations\|export function classifyLogAgainstBookings\|export function presenceOf\|export async function getCrewForOrder\|export function sumByUnit" -r src` → 5 hits.
5. A read-only real-browser check of the changed screens per role (accounts in `.env.e2e`, dev server with the `MIS_ENABLED_ACCOUNTS` override; never write to the live DB). R3-AND: gradle unit tests + migration tests on an emulator.
6. Update `docs/COMPLETION_TRACKER.md` → section "Tester round 3" (TODO / IN_PROGRESS / PR # / MERGED / DEPLOYED per cluster). A new session resumes from the tracker plus this folder.

## Deploy plan
**Before Deploy 1 (read-only, orchestrator, Supabase SELECTs only):**
- (a) The PO-status list from R3-STK acceptance 1.
- (b) `scripts/recompute-item-balances.sql` preview for items where ledger ≠ txn balance.
- (c) Distinct kiosk `operator_id`s whose employee lacks an operator role (R3-ATT B57). If > 0, fix the roles first.
- (d) The legacy STORE_ISSUE count (expect 36).
- Tell the owner in one message: the Store Guy 2% cap, Admin PO rates now ignored, gate operators can't edit outside the correction window.

**Deploy 1 = waves 1 + 2 (no schema).** PR `phase-a` → `main`, smoke-check (login per role, GRN, issue, crew, payroll page, CoA print), then add the tester block (below).
**APK:** build from merged `phase-a` (R3-AND), install on ONE tablet for one factory day (watch the queue/STUCK counts on Health), then roll out to the rest. Server fields are optional, so the APK order relative to Deploy 1 does not matter.

**SQL step (owner, Supabase SQL editor, in this order, each file whole):**
1. `prisma/migrations-pending/20261014000001_r3_production_void_makeready/apply-in-sql-editor.sql`: any time after Deploy 1 (additive, safe for running code).
2. `prisma/migrations-pending/20261014000002_r3_worker_allocation_default_shift/apply-in-sql-editor.sql`: any time after Deploy 1 (additive. If it aborts with "duplicate open worker rows", send the message to the orchestrator; nothing is applied).
3. `prisma/migrations-pending/20261014000003_r3_item_unit_text/apply-in-sql-editor.sql`: **the same day as Deploy 2, just before it** (column type change).
After each file, run the `-- verify:` SELECTs at its bottom and paste the output into the tracker.
(If still pending from R2: `prisma/migrations-pending/20261004000000_mis_bom_versioning`, `20261012000000_mis_supplier_invoice_status`, and `scripts/store-txn-backfill-grn.sql`, which are owned by R2. Check their tracker status; R3 does not depend on them.)

**SG step (after files 1-2 are applied; file 3 may follow, but SG must not deploy before file 3):** branch `chore/r3-schema`, Haiku plus an Opus review:
- Add to `schema.prisma`:
  - `MisProductionLog.voidedAt DateTime? @map("voided_at")`, `voidReason String? @map("void_reason")`, `makereadyMinutes Int? @map("makeready_minutes")`
  - `MisQcCheck.voidedAt`, `voidReason`
  - `MisEmployee.defaultShiftId String? @map("default_shift_id") @db.Uuid` + `defaultShift MisShift? @relation("MisEmployeeDefaultShift", fields: [defaultShiftId], references: [id], onDelete: SetNull)` + the back-relation `defaultForEmployees MisEmployee[] @relation("MisEmployeeDefaultShift")` on `MisShift`
  - `MisWorkerAllocation.releasedById String? @map("released_by_id") @db.Uuid`, `releaseReason String? @map("release_reason")`, `crewRole String? @map("crew_role")`. Add a comment naming the partial unique index `mis_worker_allocations_open_uq`, and update the MIS-262 comment to "application lock with ADMIN override (R3 B98)".
  - `MisItem.unit String @default("KG")`. Keep `enum MisItemUnit` declared and unused for now (comment: "removed by R3-S2").
- Move the 3 folders from `prisma/migrations-pending/` to `prisma/migrations/` (their ledger rows already exist, so `pnpm db:deploy` skips them).
- `pnpm db:generate`, tsc must be silent, `pnpm test` green.
- Merge into `phase-a`. **Not deployable on its own** until all 3 SQL files are applied.

**Wave 3** (S1 ∥ S2) → gate → **Deploy 2** = `phase-a` → `main`. Precondition: the 3 verify outputs are in the tracker. Smoke: production detail, QC detail, crew, employees, items, kiosk pull (staging), plus a void and un-affected totals.
**Rollback:** code first (Vercel instant rollback to the previous deployment), then, only if needed, the ROLLBACK block of the SQL file. Never roll SQL back while code that selects the columns is live.

## Tester re-test block (add to `docs/qa/MIS_V2_TESTER_GUIDE.md` after each deploy)
**§13 R3 / Deploy 1: "re-test only this"**, per role, each line = action → expected:
- Store Guy:
  - GRN receiving 102 of 100 → OK. Receiving 103 → refused with "max 102".
  - A fully received PO shows Complete and leaves the GRN picker.
  - Issue more than stock → refused.
  - A double-tap Confirm on the cart books once.
  - The Orders tab is visible and read-only, with no prices.
  - Inventory adjust needs a reason.
- Admin:
  - Over-receipt override with a reason.
  - PO line rate is ignored (shows unpriced). An unpriced PO goes to Owner approval.
  - Cannot change an employee's wage code, delete the Owner row or assign the Admin role.
  - Import a sheet with Name+Code only → category/unit unchanged.
  - New item gets the next `ITM-` code, and the code is editable.
  - GSM/Size/Unit dropdowns.
  - Cancel an order → machine and crew freed.
  - Business-rule threshold not editable.
- Owner:
  - Payroll shows MONTHLY staff with no attendance.
  - Department extra-pay day is paid.
  - Half-day gets half the festival amount.
  - Close a future month → refused.
  - Legacy issues report lists ~36 rows.
  - A CoA with a fixed failure prints PASS; a non-completed order prints the DRAFT banner.
- Supervisor:
  - Staff tomorrow's shift.
  - Move a worker.
  - Overlap/leave assignment blocked (Admin can override).
  - Copy yesterday's crew.
  - Sign-off frees the crew.
  - Add an attendance note.
  - Add a QC check.
  - Edit a production entry within 24 h (refused after).
  - Log on an unbooked machine → amber warning.
- QC: AQL sample 0 → refused. Edit a check within 24 h. Pass rate ignores N/A.
- Attendance operator:
  - Duplicate leave → refused. Self-approve → refused.
  - Mark-absent skips people who punched.
  - Edit outside the correction window → refused.
- Kiosk:
  - Night-shift worker at 05:30 defaults to OUT.
  - Revoked tablet sends queued punches before wiping.
  - Unpaired token shows the re-pair banner.
  - A bad entry no longer blocks the queue.

**§14 R3 / Deploy 2:**
- Void a production entry (reason) → totals drop and the row is struck through.
- QC voids a FAIL → refused. Admin voids it → OK.
- Makeready minutes on the job card.
- Default shift on employee → crew picker order + tablet pre-select.
- Crew roles (one in-charge).
- Crew history shows who released and why (incl. clock-out).
- New unit "Sheets" in Masters → usable on an item.
