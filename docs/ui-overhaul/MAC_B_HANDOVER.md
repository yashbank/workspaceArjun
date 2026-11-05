# Mac B handover — read PLAN.md too. Keep every reply to Owner SHORT (5-10 lines).

## Phase 0 — Preflight (do ALL before coding; fix or ask Owner, never skip)
1. Git: `ssh -T git@github.com` says "Hi yashbank!" (else: ssh-keygen -t ed25519, add pub key to GitHub account yashbank, or `gh auth login`). Clone yashbank/workspaceArjun, `git checkout feat/owner-danger-zone && git pull`.
2. Read CLAUDE.md, docs/AGENT_GOTCHAS.md, docs/ui-overhaul/PLAN.md, tester-sheet-bugs.csv (skip Deferred rows).
3. Tooling: node/pnpm versions per package.json, `pnpm i`, Playwright browsers (`pnpm exec playwright install`).
4. Env: .env.local present (DB URL, R2 creds). If missing, ASK Owner to copy from Mac A (never print secrets, never commit them). Confirm which DB it points to; prod DB = real data, so no destructive tests except on dummy data.
5. Baseline: `pnpm typecheck && pnpm lint && pnpm test` green BEFORE changes; record result.
6. Print a <=8 line preflight report (OK/missing per item). Continue only when all OK.

## Phase 1 — Build (token-lean, parallel)
- Use the repo's skills/agents (check .claude/ and CLAUDE.md); use `bpp-mis` skill; orchestrate parallel subagents in worktrees per PLAN.md tracks. T0 Danger Zone first.
- Cheap model for mechanical edits, strong model for T0 (data safety) and review. Reuse components; small diffs; no re-reading files.

## Phase 2 — Verify (3 rounds, all must pass)
R1 unit+typecheck+lint. R2 Playwright: Danger Zone (dummy customer chain: cascade tree counts correct, backup JSON+CSV in R2 + downloaded, checksum ok, delete leaves no orphans, restore returns identical rows), all roles, list consistency, widgets frequency, theme apply. R3 responsive 320/375/768/1024/1440 + code-review skill on diff. Fix and re-run until green.

## Phase 3 — Ship
Migrations -> prisma/migrations-pending, STOP and ask Owner before applying. Push branch, PR to main (do NOT merge; Mac A merges/deploys). Final report <=10 lines: changes, 3 test-round results, risks, tester message + Danger Zone live test script.
