# R2 Round 5 — Results

Build: `main` @ 477c535 (PR #98), Vercel production Ready, no runtime errors at deploy. Tester's previous build: a794727.
Gates on branch tip: typecheck clean · 398 test files / 6748 tests pass · production build OK · Playwright on preview 723 pass, 22 fail identically on production (pre-existing).
Migrations applied to live DB: half_day_leave, doc_version_void, 179_lunch_break (+ shift_handover earlier).

## Fixed — please retest (status "Fixed - Ready to Retest")
- Attendance/payroll: 161, 163, 165, 166, 167 (half-day: operator requests, Owner/Admin approves, follows Leave-pay setting; Paid = 1 day, Unpaid = 0.5), 168, 169, 170, 171, 172, 175 (Owner reopen, reason required), 184
- Shifts: 173 (shift at clock-out, auto clock-out, overtime, busy carry-over)
- BOM + search: 124, 125, 126, 138, 140, 141, 142, 146, 147, 151, 152
- Documents: 155 (Owner self-approve), 156, 157, 158 (Discard), 159 (CoA gate), 160
- Test health: 197–209
## Already correct at HEAD (tests added / tester retest only)
127, 136, 153, 178, 185–189, 191–196, and the 24 earlier "Bug Resolved / Pending" rows (91, 117–123, 128–135, 137, 143–145, 148–150, 154).
## By design / no code
162 (Admin scoped to own branch), 164 (24h time), 180 (payroll preflight Owner-only), 183 (default attendance view), 190, 181 (revocation on next sync), 182 (no photo capture; roster photo shown).
## Partial / deferred
- 139: due date added; quantity and unit not shown (order table has no such fields; needs schema change).
- 179: paid-lunch register + Owner-set minutes built; kiosk Break button not built.
- 177: unsigned release APK built from main: `mis-kiosk-android/app/build/outputs/apk/release/app-release-unsigned.apk` (kiosk code unchanged since 2026-10-26).
## Tester message
Hi — build 477c535 is live. Please retest every ID under "Fixed" above, plus 139 (due date only) and 179 (register only). Items under "By design" are explained, not changed.
