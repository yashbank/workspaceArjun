---
name: surgical-patch
description: Make the smallest correct fix for one diagnosed bug, with a regression test that fails before and passes after, in this repo's exact conventions (server/mis gated+audited functions, lib/mis pure logic, Android time mirror, colocated *.test.ts). Use after investigate-first for every bug fix, tester ticket or one-to-two file change.
---

# surgical-patch

## Rules
- One root cause, one place. Fix the shared function, not the caller. No refactor, rename,
  abstraction or "while I'm here".
- Keep the file's own style: its comment voice (`R2-nnn:` ticket tags), its helpers, its error
  message shape (`"Unauthorized"`→401, `"Forbidden"`→403, else plain words — never a table or
  constraint name).
- Time/shift logic lives in `src/lib/mis/*` (pure) and is mirrored in
  `mis-kiosk-android/app/src/main/java/com/example/mis_kiosk/data/time/*.kt`. Change both with
  the same formula and the same test vectors (`attendance-day.test.ts` ↔ `WorkDateTest.kt`).
- Money: computed in `src/server/mis/`, wage figures never in audit `before/after` (see the
  conditional in `business-rules.ts createRuleRevision`), never reaching a non-OWNER screen.
- Schema change → `mis-schema-gate`. Migration files are written, never applied by an agent.

## Loop
1. Write the regression test first, beside the module, named for the ticket
   (`it('R2-248: ...')`). Pick the fixture the neighbours use: `testing/wage-world.ts`
   (payroll, rules, wage types), `offline-fake-db.ts` (punches, queue), the in-file `store`
   pattern of `r2-batch1a-attendance.test.ts` (register, leave), `kiosk-device.test.ts` (pull).
2. Prove it fails: `git stash -- <src file>` is not needed — just run it before the fix:
   `pnpm vitest run <test file> -t "R2-248"` → red.
3. Apply the fix. Rerun the file and its neighbours (same domain): green.
4. If a contract test now fails because the DECISION changed, update the pinned expectation
   with a one-line ticket comment and say so in the log. If it fails for any other reason,
   your fix is wrong — do not touch the test.
5. `pnpm exec tsc --noEmit` and `pnpm exec eslint <touched files>`. Stale Prisma client errors
   ("not assignable to Reader", missing delegate) mean run `pnpm db:generate`, not a code change.
6. Report: files + line numbers, test names, red→green evidence, and anything you could not verify.
