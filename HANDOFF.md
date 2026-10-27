# HANDOFF — R2 Round 5 (MIS-ArjunBhaskar)

## Project overview and stack
Bhaskar Paper Products factory MIS (web + Android attendance kiosk), inside the "Arjun" workspace app.
Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 · Supabase Postgres + Auth · Tailwind v4 · Vitest · Kotlin Android kiosk.
Repo: `https://github.com/yashbank/workspaceArjun.git` (this directory, `Arjun/app`, is its own git repo). MIS code lives only in `src/app/(mis)/`, `src/components/mis/`, `src/lib/mis/` (pure), `src/server/mis/` (DB, permissions, money), `prisma/schema.prisma` (`Mis*` models).

## Install, run, test (from `app/`)
```
pnpm install
pnpm dev              # localhost:3000
pnpm typecheck        # must pass
pnpm lint             # must pass
pnpm test             # vitest run
pnpm build            # runs prisma generate first
pnpm db:deploy        # prisma migrate deploy — HUMAN ONLY, never agents (live DB)
```
Migrations are hand-written in `prisma/migrations-pending/`; never use `db:migrate:dev`.

## Goal of this task
Close every open item in the tester sheet "MIS Testing R2-V2" (Google Drive id `1dZbhlD4uEtJ8amGx_v-p6MTuKCxoJfqqG2Mq7eqnAtM`, Bugs tab). Bug IDs (R2-xxx) are ticket IDs, NOT tracker row numbers. Branch `fix/r2-round5`, PR to `main`, merge only when green. Never mark Pass in the sheet (tester does); set "Fixed - Ready to Retest" + fix notes + release + SHA.

## Done so far
- Phase 0 triage only. See `docs/qa/R2_ROUND5_TRIAGE.md` (the single source for per-ticket class and plan).
- No source code changed. Branch holds one commit (triage doc) + this file.
- Tester build a794727 == `main` HEAD, so no ticket was fixed after the tester's build.

## Open work (Phase 1, not started)
Order: A attendance/payroll (161-184) · B BOM+search UX (124-153) · C documents (155-160) · D store/orders integrity (185-196, mostly ALREADY_FIXED → characterization tests only) · E employees/kiosk/APK (177-182) · F test health (197-209). One commit per batch, tests after each.
STILL_OPEN: 161, 163, 165, 166, 168, 169, 170, 171, 172, 184, 124-126, 138-142, 146, 147, 151 (clamp), 152, 156-160, 197, 198-209.
ALREADY_FIXED / pending retest: 127, 136, 153, 174, 176, 185-189, 191-196, 178, and the 24 "Bug Resolved/Pending" rows (91, 117-123, 128-135, 137, 143-145, 148-150, 154).
BY_DESIGN: 162, 164 (24h time), 180, 183, 190.
Planned shared changes: BOM list rewrite (124,138-142) · Combobox swap (125,126) · one GlobalSearch edit (146,147,151,152) · one document-versions change (156-159).
Phases after fixes: P2 four test rounds (unit; full suite+typecheck+lint+build; browser pass per role; independent verifier on sheet Steps), P3 merge, confirm Vercel Ready for the SHA, update tracker xlsx + `docs/qa/R2_ROUND5_RESULTS.md` + tester message, ≤15-line final report.

## Owner decisions
Answered by owner so far:
- R2-155: Owner may approve a version they prepared themselves — **no second-person approval required** (the owner will confirm the rest in the next session).
Still awaiting (defaults in parentheses): R2-167 half-day leave (defer) · R2-173 shift change at clock-out (no, by design) · R2-175 reopen closed payroll month (defer) · R2-179 break punches (defer) · R2-181 revoked-device offline lockout (accept pull-based) · R2-182 kiosk photo capture (no, defer) · R2-177 who signs APK (rebuild unsigned release from HEAD) · R2-158 VOID status needs a migration (write it, owner runs it) · R2-160 inline alert instead of fail-closed crash on corrupt snapshot (alert, never print).
Decided earlier: time displays 24h by design (R2-164). Page size is 10 (`src/lib/mis/pagination.ts`); `docs/qa/R2_DECISIONS.md` R2-83 "25" is stale.

## Files/functions to change (planned, with why)
- `src/server/mis/wage-type.ts addWageRate` — same-day rate edit hits unique [code, effectiveFrom] (R2-161).
- `src/components/mis/bom/bom-list-screen.tsx`, `src/app/(mis)/mis/bom/page.tsx`, `src/server/mis/bom.ts listBomOverviewPage` — tabs, KPIs, columns, CTAs.
- `src/components/mis/bom/item-picker.tsx`, `bom-screen.tsx` — Combobox.
- `src/components/mis/search/global-search.tsx`, `src/server/mis/search.ts` — shortcut, grouping, states, length clamp.
- `src/server/mis/document-versions.ts`, `src/components/mis/documents/document-version-bar.tsx`, `src/lib/mis/document-version.ts` — latest-only issue/approve, COA gate (R2-159, Critical: block approval unless order complete and no FAIL check), void.
- `src/components/mis/attendance/*`, `leave*`, `extra-pay-days.ts`, `employee.ts`, shifts — items in batch A.
- `src/server/mis/wage-rule-keys.test.ts` (timeout), `src/components/mis/store/store-tap-targets.test.ts` (`\r?\n`), new `.gitattributes` (`* text=auto eol=lf`). Do not weaken assertions.

## Must not break
Existing suite stays green; never edit an existing test to pass (CLAUDE.md). Money computed server-side only. RBAC permission matrix (`src/lib/mis/permissions.ts`, `server/mis/navigation`). Audit logging on mutations. Leave-pay logic (`leave-pay.ts`, R2-102), document version snapshots (R2-46), pagination, global search RBAC (R2-150), payroll closed-month immutability. 44px tap targets, 48px inputs, design tokens only.

## Known failing / flaky
See test status below. Known fragility: `wage-rule-keys.test.ts` times out at 5000ms on slow machines; `store-tap-targets.test.ts` fails on CRLF checkouts (both R2-197..209, fixed in batch F).

## Conventions and gotchas
- NEVER run `pnpm mis:reset-attendance`, `workspace:reset`, or any destructive DB/data op. NEVER apply migrations; list them for the owner (`pnpm db:deploy`).
- DB: Supabase session pooler (5432), not 6543.
- Every server function: `requirePermission`, then `logAuditEvent`. API routes stay thin.
- One ticket = one branch/PR per CLAUDE.md; this round batches them — say so in the PR.
- Subagents sparingly: read-only Explore, one builder per module, one verifier at end.
- Local workflow dirs `.claude/worktrees/*` are stale agent worktrees; ignore. Do not commit them.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR body ends with the Claude Code line.
- Tester sheet is on Drive (read via Drive connector); local xlsx copies in `TESTING_OUTPUTS/` are stale (end at R2-154). Scratch dump of open tickets was at the session scratchpad and is not in git — re-export from the sheet.

## Branch / commit
See final reply (branch `fix/r2-round5`; hash recorded in the hand-off message).
