# Agent gotchas — read before working in this repo

Short, hard-won facts for AI agents (and humans) on this codebase. Add a line when you lose
30 minutes to something; delete it when it stops being true.

## Shell / environment
- **zsh globs**: `grep --include=*.ts` fails with "no matches found". Quote it (`--include='*.ts'`)
  or filter after: `grep -rn x src | grep '\.ts:'`.
- **Stale Prisma client**: after pulling a schema change, `pnpm db:generate` first. Symptoms:
  "PrismaClient is not assignable to Reader", a missing delegate (`misShiftRoster`), dozens of
  unrelated TS errors. It needs no database.
- **Android build**: JDK 17 at `~/android-tools/jdk/Contents/Home`, SDK at `~/android-tools/sdk`
  (`mis-kiosk-android/local.properties`). `JAVA_HOME=... ./gradlew --no-daemon :app:testDebugUnitTest
  :app:assembleRelease`; APK at `app/build/outputs/apk/release/app-release-unsigned.apk`; copy to
  `release/` (gitignored) and delete `app/build` after — the Mac is short on disk.
- **Disk**: no git worktrees, no second clone, one build output at a time, `rm -rf .next` after
  the build when below ~8 GB free. `~/Library/Caches` may be blocked from deletion by the sandbox.
- **Claude CLI** is not on PATH here; the VS Code extension bundles it at
  `~/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude`.
- Editing `.claude/settings.json` from an agent is blocked as self-modification; a human pastes it.

## Tests
- Fixtures by domain: `src/server/mis/testing/wage-world.ts` (payroll, business rules, wage
  types — add a delegate method there when a new Prisma call appears), `offline-fake-db.ts`
  (punches, queue, idempotency), the in-file `store` of `r2-batch1a-attendance.test.ts`
  (register, leave, closed months), `kiosk-device.test.ts` (pull payload).
- Vitest runs under jsdom; render tests use `@testing-library/react` with `fireEvent`
  (`@testing-library/user-event` is NOT installed).
- **Contract tests pin decisions** — when a ticket changes a decision, update the pinned list with
  a `// R2-nnn` comment and log it as CONTRACT; never delete the assertion:
  `navigation.test.ts` EXPECTED table · `navigation-more.test.ts` never-leak list ·
  `audit-payloads.test.ts` reviewed money-key list · `permission-matrix.test.ts` ·
  `server-gates.test.ts` · `r3-sec-*.test.ts` · `rule-history.test.ts` (`it.fails` rows document
  known gaps: flip to `it` when the gap is closed).
- Payroll rupee results are rounded to whole rupees in `basicWage`; test against `Math.round`.
- Time in tests: build instants from IST wall-clock (`at(day, h, m)` helper in
  `attendance-day.test.ts`); the DB clock is UTC+8, the factory is UTC+5:30 (D22).

## Domain rules that bite
- Night shifts: a punch belongs to the day the shift STARTED. `workDateFor` in
  `src/lib/mis/attendance-day.ts` and `WorkDate.kt` must stay formula-identical (R2-235: overtime
  grace = `max(end, start + 16h − 24h)`).
- A stale open IN (>16 h, or an earlier work day and >12 h) makes the next scan an IN (R2-213/R2-52).
- `attendance.write` holders: ATTENDANCE_OPERATOR, SUPER_ATTENDANCE_OPERATOR, ADMIN, OWNER.
  SUPERVISOR has `clearance.write` but NOT `attendance.write` (R2-252 moved regularization review).
- Closed payroll month: non-Owner edits are refused; the Owner may edit with a reason, which bumps
  `correctionsAfterClose` and the payroll screen shows a drift banner (R2-256). Reopen exists (R2-175).
- Business rules are append-only revisions keyed `(ruleKey, effectiveFrom DATE)`; a second edit the
  same day updates today's row (R2-259). Wage keys never put figures in audit payloads.
- `shift.start_time` / `shift.end_time` rule rows are orphans — hidden, not deleted (R2-241).
- Kiosk operator roles sent to the tablet are exactly `OPERATOR` / `SUPER_OPERATOR`; ADMIN and OWNER
  map to `SUPER_OPERATOR` (R2-253) so the Android `OPERATOR_ROLES` set needs no change.

## Browser testing
- `pnpm test:e2e` = Playwright against `E2E_BASE_URL` in `.env.e2e` (prod by default; set
  `http://localhost:3000` after `pnpm build && pnpm start` for local). Role accounts are in
  `.env.e2e`; auth state is cached in `e2e/.auth/`. Chromium 1243 is installed.
- `.mcp.json` registers the Playwright MCP server for exploratory checks (open a page at 390 px
  and 1280 px, click through a flow). It reuses the installed Chromium.
- Round protocol: the MAX Mac builds and gates; the PRO Mac runs Playwright + deploys. Logs are
  append-only (`docs/qa/round<N>/MAX_LOG.md`, `PRO_LOG.md`), never edit the other Mac's file.

## Skills and agents in this repo
- Skills: `investigate-first` → `surgical-patch` / `lean-build` → `verify-and-stop`;
  `mis-round-fix` runs a whole QA round; `mis-schema-gate` for Prisma; `mis-permission-matrix`
  for role audits; `mis-tester-sheet` for the tester workbook.
- Agents (`.claude/agents/`): `mis-orchestrator` playbook, `mis-be-build/check`, `mis-fe-build/check`.
- Plugins (project scope, `.claude/settings.json`): `context7` (live Next 16 / Prisma 7 / Tailwind v4
  docs — ask it before guessing an API), `pr-review-toolkit` (multi-angle PR review agents).
- Permissions: `.claude/settings.recommended.json` holds the allow/deny list (agents cannot write `settings.json`; copy it over once per Mac) — it allows read/test/git commands and denies migrations,
  data resets, force pushes and worktrees, so autonomous runs do not stall.
