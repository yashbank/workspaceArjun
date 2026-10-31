You are the LEAD ENGINEER and team orchestrator for "R2 Round 6" on MIS-ArjunBhaskar (app folder: Workspace Arjun - Live Project/Arjun/app). You run on the MAX Mac. A second Mac (PRO) will verify and deploy. Follow this file exactly.

# DISK RULES (this Mac is almost out of disk space)
- Run `df -h ~` first. If free space is under 6 GB, STOP and tell me what to free.
- NO git worktrees and NO `isolation: worktree` agents (the repo already has many heavy copies under .claude/worktrees). All agents work in the single main working tree on NON-OVERLAPPING files.
- No second clone, no duplicate node_modules. Use the existing pnpm store. Do not run `pnpm install` unless the lockfile changed.
- Run no Playwright or browser downloads on this Mac (PRO Mac does that).
- Keep ONE build output at a time. After the Android release build, copy only the final APK to the repo folder `release/` (overwrite, never accumulate), then delete the gradle `build/` and `.next/` folders you created. Prefer `./gradlew assembleRelease --no-daemon`, then `./gradlew --stop`.
- Do not store logs or outputs in the repo. Append only short lines to docs/qa/round6/MAX_LOG.md.

# TEAM (you are the lead; spawn only what is needed, at most 2 agents at once)
- Model: you (lead) on the strongest available model. Subagents: builders on Sonnet 5.5, explorer on Haiku 5.5 (read-only), final verifier on the strongest model.
- Explorer (1): triage every ticket against HEAD (does it still fail?), return a table, no edits.
- Builder-ATT: attendance, kiosk server, queue, punch, regularization (F1, F2 server, F9, F10, F11, F12, F13).
- Builder-PAY: payroll and settings (F3, F14, F15, F7, F16).
- Builder-UI: /mis/me, navigation, payroll layout (F4, F5, F6).
- Builder-AND: Android kiosk (F2 Android WorkDate.kt, F8, F13 Android, release APK).
- Verifier (1, at the end): independently re-run each ticket's steps from the plan and report PASS/FAIL per ID.
- Builders must not touch each other's files. If two fixes need the same file, run them one after the other. Never spawn an agent per ticket. Give agents file paths and line ranges, never "explore the repo".

# PHASE 0: PREFLIGHT (do this now, then STOP)
1. `df -h ~`, `git status`, `git pull origin main`. Confirm pnpm works and the Android SDK/Gradle exist (just check versions, do not install anything big).
2. Read docs/qa/R2_ROUND6_COORDINATION.md fully (the plan, already on main). It is the source of truth for tickets, fixes F1-F17, decisions D1-D4, batches A-D and rules.
3. docs/qa/round6/MAX_LOG.md and PRO_LOG.md already exist. Do not edit PRO_LOG.md.
4. Print to me, in under 15 lines:
   a) ESTIMATED TOTAL TIME for all batches, with a per-batch breakdown.
   b) MANUAL STEPS REQUIRED FROM ME before I leave (be concrete: for example, keep the Mac plugged in and awake via `caffeinate -dimsu`, enable auto-accept/permission mode so the run does not stall on prompts, free disk space if needed, any credentials or tools missing, and the owner decisions D1-D4 if you need an answer; otherwise state you will use the recommended options).
   c) Any risk you see.
5. Then STOP and wait for my reply "go". Do not start development before that.

# PHASE 1 (after "go"): AUTONOMOUS RUN, no questions
- Create branch fix/r2-round6. Triage first (Explorer), log it. Tickets already fixed on HEAD are logged ALREADY_FIXED with the commit and test, not rewritten.
- Execute batches A, B, C, D from the plan in that order. Per batch: builders fix with the smallest possible change and a regression test, then you run the gate (typecheck, lint, full tests, production build), then append to MAX_LOG.md and push the branch. Do not stop between batches.
- If a ticket is blocked or ambiguous, apply the recommended option from the plan, log it, and continue. Never stop to ask.
- Never merge to main, never apply migrations to the live DB (list them in MAX_LOG for me to run with `pnpm db:deploy`), never run `pnpm mis:reset-attendance`, never run destructive data commands.
- Do not weaken or delete existing tests. Keep 24-hour time display, the Admin wage-field restriction and the 3-day operator correction window as they are.
- Finish with the Verifier pass, clean up the disk artefacts, push, and print a summary of at most 10 lines: tickets fixed / already fixed / by design / blocked, migrations for me to run, APK path, final disk free space.
