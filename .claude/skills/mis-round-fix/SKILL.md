---
name: mis-round-fix
description: Run a whole tester QA round (R2-xxx / R3-xxx tickets from a coordination plan) end to end on one Mac — preflight, Haiku triage, ≤2 Sonnet builders on non-overlapping files, the lead on cross-cutting logic, gate per batch, append-only MAX_LOG, independent verifier, follow-ups, push. Use when a coordination plan like docs/qa/R2_ROUND<N>_COORDINATION.md exists and the owner says "go".
---

# mis-round-fix

Proven on R2 Round 6 (30 tickets → 17 fixes, ~45 min wall clock, 0 regressions).

## 0. Preflight (then STOP for "go")
`df -h ~` (≥6 GB) · `git status` clean · `git pull origin main` · pnpm/node versions · JDK at
`~/android-tools/jdk`, SDK at `~/android-tools/sdk` (kiosk only) · read the plan fully · print
≤15 lines: time estimate per batch, manual steps (caffeinate, permission mode, disk, D-decisions
→ "recommended options applied"), risks.

## 1. Branch + triage
`git checkout -b fix/<round>` · push `-u` · spawn ONE Explore agent (haiku) with every fix's
exact file + line range from the plan and the `investigate-first` verdict table as output.
Verify its uncertain rows yourself (5 min). Append the triage block to MAX_LOG, commit, push.

## 2. Build in batches
- Lead (strongest model) takes cross-cutting logic: time/shift rules, payroll, permission gates,
  closed-month rules. Builders (sonnet) take single-module fixes. **At most 2 agents at once,
  never one per ticket, never overlapping files** — if two fixes share a file, serialise them.
- Each brief: ticket ids, file + line range, the exact rule/formula, the fixture to copy, the
  test file to add to, the ONLY files it may edit, the test command to run, "report files + lines
  + test names + output tail". Builders never commit, never run the full suite or the build.
- Android: edits only; the lead runs Gradle once, in the background, while the web gate runs.
- Decisions D1..Dn: apply the plan's recommended option, log it, keep moving. Never ask mid-run.
- Contract tests that pin changed behaviour: update with a ticket comment, log as CONTRACT.

## 3. Gate + log + push
`verify-and-stop` per batch (or once for A–C when files interleave; say so in the log).
MAX_LOG line format: `ID | STATE | sha | note` with states TODO → DEV_DONE → GATE_PASSED →
(PRO) PRO_VERIFIED → DEPLOYED, or ALREADY_FIXED / BY_DESIGN / BLOCKED_DECISION.

## 4. Verifier + follow-ups
One read-only agent on the strongest model: per fix PASS/FAIL/UNVERIFIED with file:line, the
preserved-behaviour list from the plan, adversarial inputs, and what PRO's Playwright pass must
cover. Fix its small findings (message wording, a UI gate), re-gate touched tests, log, push.

## 5. Summary (≤10 lines)
fixed / already fixed / by design / blocked · contract changes · migrations for a human
(`pnpm db:deploy`) · APK path · disk free. Never merge, never apply migrations, never reset data.
