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
R2-238 | DEV_DONE | - | /mis/me: unlinked login gets an amber "not linked, ask an Admin/Owner" card (role=status); no auto-link; page.test.tsx added
R2-249 | DUPLICATE | - | same fix as R2-238
R2-239 | CONTRACT | - | navigation.ts: me entry no longer phoneOnly -> every role's desktop sidebar ends in Me; navigation.test EXPECTED gets 'me' for all roles, navigation-more never-leak list drops 'me' // R2-239
R2-255 | DUPLICATE | - | same fix as R2-239
R2-240 | CONTRACT | - | cancelLeaveRequest: approved leave not yet started may be cancelled by ADMIN or the person themself (reason 3+); started -> Owner only. leave/page canRevoke includes ADMIN; MyLeaveScreen Cancel + reason slide-over; r2-batch1a R2-168 pin reworded (past leave) // R2-240
R2-261 | DUPLICATE | - | same fix as R2-240 (decision: yes)
R2-250 | DEV_DONE | - | employee form: non-Owner sees "Pay type and wage code are set by the Owner" note; server rule unchanged (decision)
R2-262 | BY_DESIGN | - | 3-day operator window kept; characterised by correction-window.test.ts ("other roles keep the general window, defaulting to 3")
R2-263 | CONTRACT | - | new action roster.write (OWNER, ADMIN, SUPERVISOR, ATT_OP, SUPER_ATT_OP) gates assignRoster/removeRoster and the roster section on /mis/attendance/shifts; permissions.test pins + MIS_ACTIONS 41 // R2-263; shift-roster.test.ts added
R2-264 | SCHEMA (pending) | - | MisOrder.quantity Decimal? + unit String? (PIECE/KG/REAM, lib/mis/order-quantity.ts); mandatory on createOrder; QUANTITY_MET close gate (produced >= ordered, same unit); form/list/detail/job card show it. Migration prisma/migrations-pending/20261031000000_r2_round6b_order_quantity_customer_po NOT applied. orders-numbering createOrder({}) -> ORDER // R2-264 (CONTRACT)
R2-265 | SCHEMA (pending) | - | MisOrder.customerPoRef String? (same migration); optional; list search + global search match it; printed on the job card; snapshot carries it
R2-266 | DEV_DONE | - | reopenOrder returns + audits REOPEN_WARNING (reservations/bookings not restored); order detail shows it after a reopen (toast + status line)
R2-267 | CONTRACT | - | updateOrderStatus CONFIRMED->IN_PRODUCTION needs an APPROVED BOM; Owner may start with a reason (audited startedWithoutApprovedBom); OrderStatusError BOM_NOT_APPROVED; Start panel for the Owner; r3-ord-orders forward-move pin seeds an approved BOM; actions-status outcome pin gains reason // R2-267
R2-268 | DEV_DONE | - | listOpenOrderBomMaterials scales BOM quantity by order.quantity (none = x1); BOM screen labels quantities "/ unit"; no schema change (decision: per unit as stored)
R2-269 | DEV_DONE | - | assertBomComplete refuses a material with no catalogue item (names the line) on submit and approve
R2-270 | DEV_DONE | - | assertBomComplete refuses an empty stage (names it); fixtures bom-lifecycle/r3-ord-bom/bom.test gain misBomStage.findMany
R2-271 | DEV_DONE | - | BOM overview Owner cost label reads "₹x (floor · N unpriced)" when any line is unpriced
R2-282 | ALREADY_FIXED | R3 B64 | nav bom entry requires orders.read (STORE_GUY holds it); getBom + getBomDesktopView admit STORE_GUY and strip ratePerUnit (wage-leak.test READERS, bom-desktop.test READERS, navigation.test STORE_GUY 'bom')
R2-275 | DEV_DONE | - | cancelPO counts only CONFIRMED GRNs; DRAFT GRNs (+items) are deleted in the same transaction; audit after.discardedDraftGrns; fixtures r3-mst-po/po-bom-guards gain misGrn.deleteMany + misGrnItem.deleteMany
R2-276 | DEV_DONE | - | addPOItem/updatePOItem refuse a unitId whose text (or Master Units option) is not the item's unit (normaliseUnit)
R2-274 | DEV_DONE | - | bomOverOrderWarning: live POs for the same bomRef+item vs BOM per-unit x order qty, >105% -> warning returned from the line write and toasted (never blocks); server-gates REVIEWED_UNGATED entry // R2-274
R2-273 | BY_DESIGN | - | decision: Admin may not enter PO rates (D5/D24); Owner prices unpriced lines at approval (setPoLineRate); no code
R2-272 | SCHEMA (pending) | - | MisPurchaseOrder.deliveryDueDate Date? + paymentTerms String? (lib/mis/po-terms.ts PAYMENT_TERMS); validated on create/update, date mandatory via assertPoHeaderComplete in createPoAction; list form, detail header/edit, print PO. Migration prisma/migrations-pending/20261031000001_r2_272_po_delivery_terms NOT applied
R2-279 | CONTRACT | - | receipt-rules: RECEIPT_HARD_CEILING 5% — Admin override only up to ordered+5%, past it OWNER only with reason (overCeilingMessage); r3-stk-grn pins for Admin at 110/130/150/500 updated // R2-279; GRN screen offers the reason box to the Owner on the 5% message
R2-280 | SCHEMA (pending) | - | MisSupplierInvoice.varianceSignedOffById/At/Note; signOffInvoiceVariance (wages.read = Owner) on DISCREPANCY_*; reconcile clears a sign-off when the status changes; board row.signedOff for every reader; screen: Owner button + "Not to be paid until the Owner signs off" for others; board pin on update data // R2-280
R2-278 | SCHEMA (pending) | - | MisQuarantineStock (HELD/RETURNED) written per damaged GRN line on confirm (never the ledger); returnQuarantineToSupplier (Owner); listQuarantineForGrn; GRN detail quarantine card. Fixtures r3-stk-grn/r2-round5-185/grn-integrity gain misQuarantineStock delegates
R2-277 | SCHEMA (pending) | - | MisGrnStatus REVERSED + MisGrn.reversedById/At/reverseReason; reverseGRN (Owner, reason): negative ledger row (GRN_REVERSAL) + OUT txn per line, PO line counters decremented, GRN earmarks removed, PO status recomputed (APPROVED when nothing left), invoice re-matched; GRN detail Reverse slide-over. Migration prisma/migrations-pending/20261031000002_r2_round6b_grn_reverse_quarantine_invoice_signoff NOT applied
R2-281 | ALREADY_FIXED | R3-STK B11 | item-cart.tsx sends a crypto.randomUUID commit key (rotated after success); commitReceipt/commitIssue run under runIdempotent (store.ts runOnce); tests r3-stk-grn "B11 cart idempotency", r3-stk-actions key pass-through
R2-283 | ALREADY_FIXED | R3-STK B09 | reconcilePhysicalCount recomputes delta = physical - min(ledger, txn balance) under the item lock, never the stored discrepancy; test r3-stk-store "B09 reconcile works against the stock now"
GATE | B1-B9 | - | tsc clean, eslint 0 errors (5 pre-existing warnings), vitest 421 files / 6958 tests green, pnpm build green. 3 migrations pending in prisma/migrations-pending (20261031000000, 20261031000001, 20261031000002). Waiting for the owner to apply them before the final re-verify.
