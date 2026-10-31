---
name: investigate-first
description: Triage a bug or tester ticket against the CURRENT code before touching anything — confirm it still fails on HEAD, find the one root cause and the one place to fix it, and list every caller and test the fix must reach. Use for any ticket, bug report, "it doesn't work" or unknown-cause task, and at the start of every QA round (R2/R3 rounds, MAX_LOG triage).
---

# investigate-first

Most tester tickets in this repo are duplicates of one root cause, or were already fixed after the
tester's build. Finding that out costs minutes; rewriting a fix costs an hour and a regression.

## Steps (read-only, no edits)

1. **Pin the build.** `git log --oneline -1` and the SHA the tester tested (coordination doc or
   tester sheet). `git log --oneline <tester-sha>..HEAD -- <path>` shows what already changed.
2. **Locate, don't explore.** `grep -rn "<symbol or message text>" src | grep -v generated`,
   then `sed -n 'A,Bp' <file>` on ±30 lines. Never read whole files. zsh note: quote globs
   (`--include='*.ts'`) or they error with "no matches found".
3. **Reproduce in your head with the exact input** from the ticket (time, role, shift, status).
   Trace the one function that decides the outcome. Write the line number down.
4. **Decide one of three verdicts** per ticket, with evidence `file:line`:
   `STILL_FAILS` (root cause + the smallest change) · `ALREADY_FIXED` (commit sha + the test that
   covers it) · `BY_DESIGN` (the decision doc / rule number).
5. **List what the fix must reach**: callers (`grep -rn "functionName("`), the Android mirror if
   it is time/shift logic (`mis-kiosk-android/.../data/time`), the test file beside the module,
   and any **contract test** that pins behaviour (`navigation.test.ts` EXPECTED table,
   `audit-payloads.test.ts` reviewed list, `permission-matrix.test.ts`, `server-gates.test.ts`,
   `r3-sec-*.test.ts`). A changed decision means updating the pinned list WITH a ticket comment —
   never deleting the assertion.
6. **Group duplicates**: tickets sharing a root cause become one fix with one regression test.

## Output

One table `Ticket | Verdict | file:line | existing test`, then for each STILL_FAILS the
one-sentence fix and the files it touches. Stop. Hand to `surgical-patch`.
