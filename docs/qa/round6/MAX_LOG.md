# MAX_LOG (append-only, written by the MAX Mac). Line format: ID | STATE | sha | note
R2-234 | DEV_DONE | - | kiosk pull resolves shift: allocation > attendance > today's roster > defaultShiftId (kiosk-device.ts buildPullPayload); select pin updated // R2-234
R2-247 | DUPLICATE | - | same fix as R2-234
R2-235 | DEV_DONE | - | workDateFor overnight cutoff = max(end, start+16h-24h) (attendance-day.ts overnightCutoffMinute); isStaleOpenIn test 19:00->07:15 not stale
R2-246 | DEV_DONE (server) | - | same as R2-235; Android WorkDate.kt in B2
R2-248 | DEV_DONE | - | queue-resolve: TOO_OLD also sets skipEmployeeChecks so the correction window is bypassed with the note
R2-251 | DEV_DONE | - | bulkPunch IN resolves shiftId (named > roster > default) like clockIn
R2-253 | DEV_DONE | - | operatorRoleOf ADMIN/OWNER -> SUPER_OPERATOR; Android OPERATOR_ROLES unchanged; pins updated // R2-253
R2-252 | CONTRACT | - | REVIEW_ACTION clearance.write -> attendance.write; attendance/page.tsx uses REVIEW_ACTION; punch-regularization.test reviewer lists updated // R2-252 (Supervisor out, operators in)
R2-244 | ALREADY_FIXED | 48965ff | past-date Clock In on unrecorded rows exists since R2-165; characterization test added (r2-batch1a-screens.test.tsx)
R2-246 | DEV_DONE (Android) | - | WorkDate.kt overnightCutoffMinute mirrors server formula; WorkDateTest vector added; 52 Android unit tests green; release APK at release/app-release-unsigned.apk (unsigned)
R2-243 | DEV_DONE | - | QueueScreen: Dismiss (48dp) + confirm AlertDialog on PARKED/REJECTED/STUCK rows; QueueViewModel.dismiss refuses PENDING (QueueDismissTest)
R2-254 | DUPLICATE | - | same fix as R2-243
R2-236 | DEV_DONE | - | payroll.ts paidWeeklyOff = MONTHLY || sundayPaid: weekly off paid + synthetic Sundays for sundayPaid DAILY (sandwich/weekly_off kept); tests assert Math.round rupees. NOTE schema comment L365 ("only when present") is now stale
R2-245 | DUPLICATE | - | same fix as R2-236
R2-256 | DEV_DONE | - | server already: Owner edit with reason bumps correctionsAfterClose (guardRegisterDate); added payroll-screen drift banner (role=status) when CLOSED && corrections > 0; no auto-recalc per decision
R2-257 | DEV_DONE | - | Half-day column in payroll table (payroll-screen.tsx)
R2-237 | DEV_DONE | - | payroll-screen: lg:max-w-7xl, cards 2-up grid on desktop, actions in one column, table lg:col-span-2; phone unchanged
R2-258 | DUPLICATE | - | same fix as R2-237
R2-259 | CONTRACT | - | createRuleRevision: a same-day (UTC date) revision is updated in place (todaysRevision), audited UPDATE_RULE; rule-history it.fails x2 flipped to it; r3-sec-rules-docs same-day pin flipped to resolves // R2-259; fixture delegates misBusinessRule.update added (wage-world, qc-aql-decisions)
R2-241 | DEV_DONE | - | getBusinessRules hides shift.start_time / shift.end_time (HIDDEN_RULE_KEYS); rows untouched
R2-242 | DEV_DONE | - | late_rule_workers: LATE_WORKERS_OPTIONS enum in lib/mis/late-rule.ts, refused on save unless ALL/DAILY/MONTHLY, description overridden server-side, Settings renders a Select
R2-260 | DUPLICATE | - | same fix as R2-242 (validation on save; runtime parser still falls back to ALL so a punch is never blocked)
