# R3 handoff (2026-10-13) — resume here in a fresh session

## State
- Repo: "Workspace Arjun - Live Project/Arjun/app", branch `phase-a` -> `main` (Vercel prod https://workspace-arjun.vercel.app). Supabase project `kmaxtksmeabmmlervpjl`.
- **Deploy 1 LIVE** (PR #92, ff567d6): all R3 non-schema clusters merged: SEC #83, WRK #84, STK #85, MST #86, ATT #87, AND #88 (Android), QCR #89, ORD #90, PRD #91. Gate at deploy: tsc clean, 5700 tests, eslint 6 known `any`, build OK.
- **Owner SQL applied and verified (2026-10-13):** `20261014000001` (void + makeready columns) and `...0002` (default shift, worker release cols, open-row unique index). Both ledger rows present. **File `...0003_r3_item_unit_text` NOT applied** (do it the same day as Deploy 2, just before).
- NOT yet in `schema.prisma`: voidedAt/voidReason/makereadyMinutes (production log, QC check), MisEmployee.defaultShiftId, MisWorkerAllocation.releasedById/releaseReason/crewRole. Code must not reference them until step SG.
- No real-browser role walkthrough was run (agent can't type test passwords into hosted Supabase login). Tester does the logged-in checks via guide §13.

## Remaining plan (specs already written in docs/specs/)
1. **SG** (`R3-README.md` §SG, Haiku + Opus review): add the columns above to schema.prisma, move the 3 migration folders from `prisma/migrations-pending/` to `prisma/migrations/`, `pnpm db:generate`, tsc, tests. Do NOT include `...0003` fields (unit text) until file 3 is applied — keep `enum MisItemUnit`.
2. **Wave 3, parallel worktrees (Sonnet, Opus review):** `R3-S1-void-makeready.md`, `R3-S2-people-units.md`.
3. Gate (fresh worktree: install, db:generate, tsc, `pnpm test`, `eslint src e2e` = 6 known, `pnpm build`), owner runs SQL file 3, PR phase-a -> main, wait Ready, curl smoke, add tester §14 (outline in R3-README.md), `python3 scripts/tester_sheet.py build`.
4. Later (not scheduled): Jira sync after tester report; role/screen docs with screenshots; write-flow all-roles test with cleanup.

## Rules that stop regressions (every agent)
- Read `.claude/agents/mis-orchestrator.md` + `docs/specs/R3-README.md` + ONE cluster spec. Test first; never weaken an existing test (only change a contract expectation with a backlog-id comment).
- NO global-db / logAuditEvent / requirePermission inside an interactive `$transaction` (connection_limit=1 deadlock; found 3 times). Audit after commit (`flushReleaseAudit`).
- Money OWNER-only; follow `mis-permission-matrix` for any role/money change. Schema only via `mis-schema-gate` (SQL first, schema.prisma last).
- Every change reviewed by Opus on stock/money/schema/permission hunks; orchestrator runs the full gate once per batch and merges.

## Owner/tester items
- Tester round: send `docs/qa/MIS_TESTER_TRACKER.xlsx` + guide §13. Merge his returned workbook with `python3 scripts/tester_sheet.py merge <file>`; import new bug report with `seed-bugs <report.md>`; update with `set`. Skill: `.claude/skills/mis-tester-sheet`.
- Verify the real gate operators have an attendance-operator role before rolling the new APK (3 old test operators are WORKER/SUPERVISOR).
- Local checkout note: owner's uncommitted `mis-kiosk-android/.../PunchViewModel.kt` conflicts with PR #88; commit/stash it before `git pull`. Main checkout also has one stale local tracker commit (already on origin via another commit).
- Open decisions kept at defaults: Q1 no narrowing of gate-operator rights; Q2 Admins cannot assign Admin; Q3 overlap/leave blocks Supervisors, Admin override with reason; supplier-invoice tolerance max(₹1, 0.5%); 36 legacy STORE_ISSUE rows read-only report (Owner).

## Fresh-session prompt
"Resume R3. Read docs/R3_HANDOFF.md, then the R3 section of docs/COMPLETION_TRACKER.md, .claude/agents/mis-orchestrator.md, docs/specs/R3-README.md. Do SG, wave 3 (S1 ∥ S2), gate, ask me to run SQL file 3, Deploy 2, tester §14. Use Sonnet agents in worktrees, Opus reviewers on stock/money/schema diffs, keep chat output very short, report per phase. If the tester's new bug sheet is attached, run `seed-bugs` first and add anything Blocker/Major to the plan."

## APK refresh prompt (run in the Claude Code CLI inside mis-kiosk-android)
"Pull latest phase-a (git stash my uncommitted PunchViewModel.kt first, then git pull --ff-only origin phase-a, then git stash pop and tell me if it conflicts). Then: export JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ANDROID_HOME=$HOME/Library/Android/sdk; cd mis-kiosk-android && ./gradlew :app:assembleDebug --console=plain; adb install -r app/build/outputs/apk/debug/app-debug.apk; adb shell am start -n com.example.mis_kiosk/.MainActivity. Report only success/failure and any error line. Do not read other files."
