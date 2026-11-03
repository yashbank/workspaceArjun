---
name: mis-sheet-release
description: Full tester-sheet-to-release loop for the BPP MIS. Pull open rows from the Google Sheet (Bugs tab), plan, fix with ≤2 builders without touching existing tests, run gates + Playwright, merge to main, update the sheet, draft the tester message and the APK/platform go-live ask. Use when the owner says a tester handed over a new sheet / new round (R2-nnn, R3-nnn).
---

# mis-sheet-release

Wraps `mis-round-fix` (build/gate/verify) with the sheet in and the sheet out. Cheap by design:
big sheet data never enters context; agents get file+line briefs; the lead only reads reports.

## 1. Pull (never read the whole tab)
Sheet `1dZbhlD4uEtJ8amGx_v-p6MTuKCxoJfqqG2Mq7eqnAtM`, tab `Bugs`, header row 1.
a. `get_values Bugs!A200:C<end>` (3 cols only) → find rows whose Status ∈ New Bug, Bug Reproduced,
   Enhancement Requested, Enhancement Still Required. Skip duplicates (same ID twice → treat as 2 rows, suffix a/b).
b. `get_values Bugs!A<first>:O<last>` for ONLY those rows (cols: ID, Type, Status, Severity, Role/screen,
   Title, Steps, Expected, Actual, Device, Reported, Fix notes(=tester suggestion), Release, Retest, Comment).
   If the tool dumps to a file, extract with `python3 -I` + json, never Read whole.
c. Write verbatim to `docs/qa/R2_ROUND<N>_BUGS.md`; row numbers into the plan.

## 2. Plan
`docs/qa/R2_ROUND<N>_PLAN.md` modelled on `R2_ROUND6C_PLAN.md`: batches, files, schema Y/N, risk,
preserved behaviour. Decisions with a sensible default → apply the default, log it in
`R2_ROUND<N>_DECISIONS.md`; never ask mid-run. Branch `fix/r2-round<N>` from fresh `origin/main`.

## 3. Build — hard rules
- Additive only: new components/files over edits; never edit/delete an existing test or assertion.
  If a contract test must change, add `// R2-nnn` comment and log CONTRACT.
- Each fix ships with a NEW test file (`r2-<id>-*.test.ts(x)`) that fails before / passes after.
- ≤2 agents, disjoint files: web builder (sonnet), android+small-web builder (sonnet). Lead does review.
- Schema: `mis-schema-gate` (pending migrations only, never deploy).
- Android: edits + `./gradlew testDebugUnitTest assembleDebug` once (JDK ~/android-tools/jdk).

## 4. Gates (verify-and-stop)
`node_modules/.bin/tsc --noEmit --skipLibCheck` · `pnpm lint` · `pnpm test` (count ≥ previous) ·
`pnpm build` · Playwright: `pnpm test:e2e` (existing specs, regression) + a new
`e2e/r2-round<N>.spec.ts` for the new behaviour (390px + 1280px). Independent read-only verifier agent
(`caveman:cavecrew-reviewer` or opus) on the diff: PASS/FAIL per ID with file:line.

## 5. Ship (only after all gates green)
Commit per batch (Co-Authored-By trailer), push, PR to `main`, merge, confirm Vercel deploy READY
(Vercel MCP `list_deployments`). Pending migrations → STOP and ask owner to apply first.

## 6. Sheet + tester
Update sheet via `update_values` on Bugs cols C (Status="Fixed - Ready to Retest"), L (Fix notes: what+file+test),
M (Release: `date · sha`). Do not touch N/O (tester-owned). Mirror in `docs/qa/MIS_TESTER_TRACKER.xlsx`
via `mis-tester-sheet` skill. Draft `docs/qa/R2_ROUND<N>_TESTER_MESSAGE.md`: list of IDs + retest steps +
"may we go live with the APK and platform?". Sending to tester = outward-facing → show draft, send on owner OK.
