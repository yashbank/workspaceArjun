# Tester round 2 — fix specs (2026-10-13)

Source: external tester report (`TESTING_OUTPUTS/MIS TESTING v2.md`, 61 items + per-role notes), each claim
triaged against `phase-a` code. Verdicts and file:line hints live in the cluster specs below. **Line numbers
drift: grep for the symbol, do not trust the number.** If a spec claim turns out false, say so and skip it.

## Global rules (every implementation agent)
1. Read `.claude/agents/mis-orchestrator.md`, `docs/MIS_UI_SPEC.md`, then ONLY your cluster spec. Do not explore beyond the files named.
2. One cluster = one branch off `origin/phase-a` (`fix/<cluster>`), one PR into `phase-a`. Never merge, never push to main.
3. Test first: write the failing test that reproduces each item, then fix. Colocated `*.test.ts`. Never edit an existing test to make it pass; if an old test encodes the bug, report it and change only that expectation with a comment.
4. While iterating run ONLY your tests: `pnpm vitest run <your files>`. Before the final commit also `node_modules/.bin/tsc --noEmit --skipLibCheck` (silent) and eslint on touched files. The orchestrator runs the full suite + build per merged batch. Do not run the full suite yourself unless the spec says so.
5. Do NOT edit: `src/components/mis/kit/*` (shared), `src/lib/mis/permissions.ts` (unless the spec says), `prisma/schema.prisma`, `src/server/mis/audit.ts`, `mis-kiosk-android/` (except cluster C7), `docs/COMPLETION_TRACKER.md`. New shared helpers go in NEW files.
6. No schema change. If you need a column, stop and report.
7. Money (wages, rates, prices, invoice amounts) is OWNER-only: redacted server-side, never in props or audit for other roles.
8. Reuse before writing: `asResult`/`unwrap` (`src/lib/mis/action-result.ts`), `requirePermission`, `logAuditEvent`, `lockStockKeys` (`src/server/mis/stock-lock.ts`), `withoutRates`, `can()`, kit `Select/Input/Button/SlideOver/EmptyState`, `src/components/ui` confirm-dialog/toast, `factory-time.ts` formatters.
9. Time is the factory's (`factory-time.ts`), never `toLocale*`/`getHours`.
10. Commit trailer: the one given in your session's attribution reminder. PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
11. Work in a single pass per the project skill `mis-fast-phase` (do the work directly; do NOT spawn sub-agents; batch related edits; tsc/vitest incrementally; no `pnpm build` — the orchestrator runs it). Cluster C3 and any change touching roles/money must also follow the `mis-permission-matrix` skill (table-driven role tests, recursive money-key scan).
12. Final report under 200 words: per item fixed / not-real / deferred, new test count, what you could not verify, PR link.

## Owner decisions (approved 2026-10-13)
- D1 PO against an unapproved BOM: **block**, with a popup "BOM is not approved". BOM Ref becomes a picker of orders whose BOM is APPROVED (value stays the order-number string; no FK). Buffer-stock POs untouched.
- D2 Negative stock: **refuse everywhere** (no over-issue-with-reason).
- D3 Physical count: keep recording; add a **"Reconcile" button with a reason** (not automatic).
- D4 GRN line with no catalog item: **block confirm and name the line**.
- D5 Purchase rates / item price on receive and Add Item: **OWNER only** (`wages.read`); others never see or write them.
- D6 QC: **no access to PO / GRN** (QC only logs production quality checks). Verify hidden + denied; no change otherwise.
- D7 Store Guy unavailable: a material request is **notified to Store Guy AND Admin AND Owner**; Admin/Owner can approve.
- D8 Kiosk forgot-to-clock-out: app **auto-selects IN after a new factory day** and always offers an operator toggle.
- D9 Anything needing a new DB column is **deferred** (owner runs SQL later).

## Clusters, waves, models
| Cluster | Items | Wave | Model |
|---|---|---|---|
| C1 `fix/c1-stock-grn` | #11 #12 #13 #14 #22 #23 #24, D7 | 1 | Sonnet; Opus reviews the diff |
| C2 `fix/c2-po-bom` | #1 #3 #4 #5 #6 #8 #9 #10 #30, PO/BOM guards | 1 | Sonnet |
| C4 `fix/c4-order-lifecycle` | #31 #32 | 1 | Sonnet; Opus reviews the diff |
| C5 `fix/c5-production-qc` | #16 #18 #19 #33 #39 #42 #43 | 1 | Sonnet |
| C7 `fix/c7-android` | #51-#61, D8 | 1 | Sonnet |
| C6a `fix/c6a-helpers` | new shared helpers only | 1 | Haiku (PageBack, PasswordInput), Sonnet (error mapper) |
| C3 `fix/c3-money-trace` | #35 #36, Admin Add-Item price, D5, D6 | 2 (after C1) | Sonnet |
| C6b `fix/c6b-wiring` | #20 #21 #26 #27 #29 #49(part) #50 | 2 (after C1,C2,C4,C5,C6a) | Sonnet |

## Deferred (phase E, needs schema or product input)
#17/#34 void production log / QC check (voidedAt/voidReason); #2/#25 master-driven item units (enum -> String); #28 generated codes; #48 makeready time; #46 document versions + two-level sign-off; #40/#41/#45 machine board sync from production logs; #47 hard worker lock; #49 default-shift column; #37/#38 permission widening; per-role wishlist (Supervisor qc/store/attendance write, Store Guy orders.read/inventory.write, QC clearance, Admin invites, Worker portal).

## Orchestrator protocol (resume-safe)
- Tracker: `docs/COMPLETION_TRACKER.md` section "Tester round 2" — update status per cluster (TODO / IN_PROGRESS / PR # / MERGED / DEPLOYED). A new session reads the tracker + this folder and continues.
- Per merged batch the orchestrator runs: `pnpm install && pnpm db:generate`, tsc, `pnpm test`, eslint on `src e2e`, `pnpm build`; then a read-only real-browser check (test accounts in `.env.e2e`, dev server with `MIS_ENABLED_ACCOUNTS` env override of PROFILE ids; never write to the live DB).
- Review: read each PR's `gh pr diff --stat`, the money-touching and schema-adjacent hunks, and any edited existing test. Merge into `phase-a`. Deploy = PR `phase-a` -> `main`, then smoke-check.
- Deploy staging: Phase A = C1+C2+C3(+C4); then C5, C6, C7 as the second deploy. After each deploy add a short "re-test only this" block (§11, §12…) to `docs/qa/MIS_V2_TESTER_GUIDE.md`.
