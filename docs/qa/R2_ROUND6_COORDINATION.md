# R2 Round 6: Coordination Plan (R2-234 to R2-263)

Repo: MIS-ArjunBhaskar (app folder: `Workspace Arjun - Live Project/Arjun/app`)
Tester build: commit `7633928`. Tester sheet: "MIS Testing R2-V2" (Bugs tab).

Place this file at `docs/qa/R2_ROUND6_COORDINATION.md`, commit it to `main`, and have both Macs pull it before starting.

---

## 1. Roles of the two Macs

| | MAX Mac (builder) | PRO Mac (verifier + deployer) |
|---|---|---|
| Does | Implements fixes, writes regression tests, runs gate checks, pushes to branch `fix/r2-round6` | Pulls the branch, runs Playwright + full suite, deploys to `main`, updates sheet, sends tester message |
| Writes to | `docs/qa/round6/MAX_LOG.md` (append-only) | `docs/qa/round6/PRO_LOG.md` (append-only) |
| Never | Merges to `main`, applies migrations to the live DB | Edits product code (if a fix is wrong, log it and send it back) |

Two separate append-only logs mean the Macs never edit the same file, so there are no merge conflicts and no repeated work.

**Ticket states** (each log line: `ID | STATE | sha | note`):
`TODO` > `DEV_DONE` (Max, tests green) > `GATE_PASSED` (Max, typecheck/lint/full suite/build) > `PRO_VERIFIED` (Pro, Playwright + suite pass) > `DEPLOYED` (Pro, live on Vercel) > `SHEET_UPDATED`.
Other states: `BLOCKED_DECISION`, `ALREADY_FIXED` (cite sha + test), `BY_DESIGN`.

**Handoff rule:** Max finishes a batch, appends to MAX_LOG.md, pushes. Pro pulls, reads the new MAX_LOG lines, and tests only those tickets. Do not re-test or re-fix anything already `PRO_VERIFIED`.

---

## 2. Ticket map (30 tickets = 17 unique fixes)

Many tickets are duplicates of the same root cause. Fix once, regression-test once, and mark every ticket in the group.

| Fix | Tickets | Root cause / what to do |
|---|---|---|
| F1 Kiosk pull returns shift null | 234, 247 | `buildPullPayload` in `src/server/mis/kiosk-device.ts` (~L696-729) ignores `defaultShiftId` and the shift roster. Select `defaultShiftId`, call `resolveEmployeeShiftId` / roster for today. |
| F2 Night-shift OT punch rejected | 235, 246 | `workDateFor` (`src/lib/mis/attendance-day.ts` ~L82, and Android `WorkDate.kt` ~L35) uses `minute < endTime`. Add an OT grace window past `endTime` (e.g. up to the stale-IN limit of 14h from the IN punch). Server and Android must use the same rule. Keep R2-52 behaviour (stale IN on a new day defaults to IN). |
| F3 DAILY worker Sunday pay | 236, 245 | `weeklyOffPaidOn` (`src/server/mis/payroll.ts` ~L168) requires `payType === 'MONTHLY'` and ignores `emp.sundayPaid`. Honour `sundayPaid` for DAILY, keeping the sandwich and `attendance.weekly_off` policy (R2-231). |
| F4 Payroll layout | 237, 257, 258 | `payroll-screen.tsx` ~L418 `max-w-2xl`. Use a wide container on desktop, export actions in a side card, add a Half-Day column. Mobile unchanged. |
| F5 `/mis/me` for unlinked users | 238, 249 | Show a clear "your account is not linked to an employee yet, ask your admin" card when `getMisEmployee` is null. Do not auto-link. |
| F6 `Me` on desktop for staff | 239, 255 | `navigation.ts` ~L97 allows desktop `me` only for WORKER. Allow all authenticated roles that have an employee profile. |
| F7 Late-rule setting | 242, 260 | Replace free text with an enum (ALL / DAILY / MONTHLY), validate on save, fix the description text. |
| F8 Queue dismiss (Android) | 243, 254 | Wire the existing `PunchRepository.dismiss(key)` into `QueueScreen.kt` for REJECTED/PARKED rows, with a confirm. |
| F9 Past-date Clock In | 244 | `attendance-screen.tsx` ~L175 gates Clock In on `isToday`. Allow within the role's correction window for unrecorded rows. (R2-165 was marked fixed earlier. Verify against HEAD first.) |
| F10 Parked TOO_OLD punch resolve | 248 | `queue-resolve.ts` ~L73-75: set `skipEmployeeChecks` / correction-window bypass for TOO_OLD when actor has `queue.review` + `attendance.write`, with a mandatory note and audit. |
| F11 Bulk punch shift | 251 | `bulkPunch` (`attendance.ts` ~L485-492) must resolve and store `shiftId` like single `clockIn` (~L254). |
| F12 Regularization permission | 252 | `punch-regularization.ts` L28 `REVIEW_ACTION = 'clearance.write'`. Change to `attendance.write`. Update the permission tests. |
| F13 Admin/Owner as kiosk operator | 253 | `operatorRoleOf` (`kiosk-device.ts` ~L638) returns null for ADMIN/OWNER. Map them. Android `PunchViewModel.kt` ~L298 must accept them. |
| F14 Closed-month attendance edit | 256 | Edit after close does not touch `MisPayrollSnapshotLine`. Minimal safe fix: show the Owner a clear banner and block silent drift (flag the period "needs reopen"), do not auto-recalculate. Needs decision D3. |
| F15 Same-day business-rule save | 259 | `business-rules.ts` ~L339-342: upsert today's row instead of throwing P2002 (mirror `addWageRate`). |
| F16 Orphan settings | 241 | `shift.start_time` / `shift.end_time` are never read. Hide them from the Settings table (do not delete data). |
| F17 Pending decisions | 240/261, 250, 263 | See section 3. |

Tickets 261 (Deferred) and 262 (Pass, by design) need no code. Record them as `BY_DESIGN` in the sheet.

---

## 3. Owner decisions needed BEFORE coding these (Yash to confirm with owner)

- **D1: Cancel an approved future leave (240 vs 261).** Tester logged 240 as a Fail and 261 as "by design, Owner only". Recommended: allow the worker or Admin to cancel approved leave **only while the start date is still in the future**, with an audit reason. Owner-only after that.
- **D2: Admin choosing pay type on onboarding (250).** Tested rule 13.9 says Admin must NOT change pay type or wage code. Recommended: keep it. Admin creates the employee with defaults, Owner sets pay type. Show a friendly message instead of a raw Forbidden error. Mark by design plus UX fix.
- **D3: Closed-month attendance correction (256).** Recommended: block with a clear message and a "Reopen month" prompt, since payroll reopen now exists.
- **D4: Supervisor roster assignment (263).** Recommended: leave as Deferred. No new permission this round.

If no answer is given, MAX applies the recommended option and logs it.

---

## 4. Execution order (batches)

1. **Batch A, attendance and kiosk blockers:** F1, F2, F10, F11, F13, F9 (+ Android build)
2. **Batch B, payroll correctness:** F3, F14, F15
3. **Batch C, UX/permissions:** F5, F6, F12, F7, F16, F4
4. **Batch D, Android:** F8, rebuild release APK from HEAD

Each batch: fix, regression test (fails before, passes after), commit, log, push.

---

## 5. Rules for the MAX Mac (anti-over-engineering)

- Smallest change that fixes the ticket. No refactors, renames, or new abstractions.
- Triage first: for each ticket confirm it still fails on `HEAD` (tester tested `7633928`). If already fixed, log `ALREADY_FIXED` with the commit and test. Do not rewrite it.
- Every fix needs a regression test. Do not weaken or delete existing tests.
- Do not touch behaviour that is decided: 24-hour time display, the Admin wage-field restriction, the 3-day operator correction window.
- Migrations: write them, never apply to the live DB. List them in MAX_LOG for Yash to run with `pnpm db:deploy`.
- No destructive data commands. Never run `pnpm mis:reset-attendance`.
- Work on branch `fix/r2-round6`. Never merge to `main`.
- Gate before marking `GATE_PASSED`: typecheck, lint, full test suite, production build, and for Android a successful release build.

### Recommended models, agents, skills (Max Mac)

- **Main session:** the strongest generally available Claude model on the Max plan (Claude Fable 5.1 if available, otherwise Claude Opus 5.5). Use it for F2, F3, F14, F10, since these are cross-cutting logic bugs.
- **Subagents:** Claude Sonnet 5.5 for builder agents on single-module fixes. Claude Haiku 5.5 only for read-only exploration (locating code). One independent verifier agent at the end, on the strongest model.
- **Skills (if installed):** `investigate-first` (triage), `surgical-patch` (small fixes with regression proof), `migration` (any schema change), `verify-and-stop` (final gate), `engineering:testing-strategy`, `engineering:code-review` (before pushing).
- Do not spawn an agent per ticket. Do not read whole files when a line range will do.

---

## 6. Rules for the PRO Mac (verifier + deployer)

1. `git pull` the branch, read the new MAX_LOG lines.
2. Run the full suite, typecheck, lint, build.
3. Run Playwright against a local production build (or a Vercel preview). Use test accounts only. No destructive writes to live data. Cover per ticket:
   - F1/F11/F13: kiosk pull payload and bulk punch (API-level tests with fixtures), operator sign-in for Admin/Owner.
   - F2: punch sequence at 19:00 IN, 07:15 OUT yields OT 15 min and no MISSING_OUT.
   - F3: DAILY worker with `sundayPaid` gets the Sunday fraction.
   - F5/F6: `/mis/me` as unlinked user, and the Me sidebar tab for Supervisor/Operator/Store Guy/QC on desktop.
   - F4: `/mis/payroll` at 1920x1080 and 390px (no horizontal clipping, half-day column).
   - F7/F15/F16: Settings: enum late rule, same-day double save, no orphan keys.
   - F9/F10/F12: past-date Clock In, TOO_OLD resolve, Super Attendance Operator approves a regularization.
4. Regression sweep: re-run the earlier Playwright/role checks for BOM, attendance, payroll, store so nothing previously passed has broken.
5. If anything fails: log `FAIL_BACK | ID | reason` in PRO_LOG and stop that ticket. Do not edit product code.
6. If all pass: merge to `main`, then **confirm Vercel built that exact SHA and it is Ready** (a previous push, `5f2c091`, was never built; if no deployment appears, push an empty commit or run `vercel deploy --prod`). Check runtime errors are empty for 10 minutes.
7. Update the Google Sheet (Bugs tab): Status = "Fixed - Ready to Retest", Fix notes, Release = `date · sha`. Never mark Pass. Refresh the Summary counts.
8. Write the tester message and a one-line verdict: **FIXED CORRECTLY** or **NOT READY (reason)**.

---

## 7. Launch prompt for the MAX Mac session

```
You are the builder for R2 Round 6 on MIS-ArjunBhaskar. Read docs/qa/R2_ROUND6_COORDINATION.md fully and follow it exactly.
Pull main, create branch fix/r2-round6. Triage tickets R2-234..263 against HEAD first, log the result in docs/qa/round6/MAX_LOG.md, apply the recommended option for any undecided D1-D4, then execute batches A-D.
Smallest possible fixes, a regression test for each, no refactors, never merge to main, never apply migrations to the live DB. After each batch run the gate (typecheck, lint, full tests, build; Android release build for batch D), append to MAX_LOG.md and push.
Finish with a 10-line summary: tickets fixed / already fixed / by design / blocked, migrations for me to run, APK path.
```
