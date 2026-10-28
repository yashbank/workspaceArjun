# R2 Round 5 — Triage (HEAD a794727)

Source: tester sheet "MIS Testing R2-V2" (Drive, Bugs tab, downloaded 2026-10-27). IDs are ticket IDs, not tracker rows.
Tester build = a794727 = HEAD, so no ticket is fixed by a post-tester commit. "ALREADY_FIXED" means HEAD handles it (tester mis-read, stale build, or retest pending).
Triage done by read-only code inspection; each STILL_OPEN is re-verified by a failing test before it is fixed.

Classes: STILL_OPEN · ALREADY_FIXED · BY_DESIGN · NEEDS_OWNER_DECISION

## Batch A — attendance / payroll
| ID | Class | Evidence | Plan |
|---|---|---|---|
| R2-161 | STILL_OPEN | wage-type.ts addWageRate: create() with no [code, effectiveFrom] check, P2002 on same-day edit | upsert-style update + audit |
| R2-162 | BY_DESIGN | visibility.ts resolveIdsFor unscopes only OWNER; D4 scopes Admin to own branch; visibility-lists.test.ts:55 | keep |
| R2-163 | STILL_OPEN | defaultShiftId in schema, unused in UI | shift select on employee form |
| R2-164 | BY_DESIGN | 24h display decided | none |
| R2-165 | STILL_OPEN | attendance-screen.tsx: Clock In only today, Edit hidden on new:* rows | past-date upsert |
| R2-166 | STILL_OPEN | toolbar only Clear / Mark Absent (enhancement) | bulk punch action |
| R2-167 | NEEDS_OWNER_DECISION | no half-day leave type; pay rules per type | see decisions |
| R2-168 | STILL_OPEN | no cancel-leave action | cancelLeaveRequest |
| R2-169 | STILL_OPEN | no withdraw for extra-pay proposal | withdrawExtraPayProposal |
| R2-170 | STILL_OPEN | no shift delete | deleteShift w/ link guard |
| R2-171 | STILL_OPEN | no standalone isActive toggle; "Deactivate" label actually deletes | setEmployeeActive |
| R2-172 | STILL_OPEN | /mis/me has no attendance view | own-records page |
| R2-173 | NEEDS_OWNER_DECISION | shift select clock-in only | see decisions |
| R2-174 | ALREADY_FIXED | sheet Pass (r2-leave-pay.test.ts) | none |
| R2-175 | NEEDS_OWNER_DECISION | payroll-period reopen deliberately unbuilt (D27) | see decisions |
| R2-176 | ALREADY_FIXED | sheet Pass | none |
| R2-180 | BY_DESIGN | payroll preflight Owner-only (S9/D24) | keep |
| R2-183 | BY_DESIGN | default attendance view per D8 | add visible Daily link only if cheap |
| R2-184 | STILL_OPEN (cosmetic) | month grid scrolls; no hint | scroll hint |

## Batch B — BOM / search / pagination
| ID | Class | Evidence | Plan |
|---|---|---|---|
| R2-124,140,141,142,138,139 | STILL_OPEN | bom-list-screen.tsx: no status tabs, KPI strip, qty/due columns, state-aware CTA | one BOM list change |
| R2-125,126 | STILL_OPEN | item-picker.tsx raw input; bom-screen.tsx plain Select | kit Combobox |
| R2-127,136 | ALREADY_FIXED | ef64f16; Page X of Y, PAGE_SIZE=10 (docs R2-83 "25" superseded) | none; note in docs |
| R2-146,147,152 | STILL_OPEN | global-search.tsx: no grouping/badges, no Cmd/Ctrl+K, no loading/empty copy | one GlobalSearch change |
| R2-151 | STILL_OPEN (clamp only) | debounce 250ms + escaping exist; no max length | clamp in search.ts |
| R2-153 | ALREADY_FIXED | 74502ad arrow/Enter/Esc | add test |

## Batch C — documents
| ID | Class | Plan |
|---|---|---|
| R2-155 | NEEDS_OWNER_DECISION | self-approval rule |
| R2-156,157 | STILL_OPEN | hide Issue when newest PREPARED; approve only newest; server guards |
| R2-158 | STILL_OPEN | VOID status → needs migration (written, not applied) |
| R2-159 | STILL_OPEN (Critical) | COA approval blocked unless order complete and no FAIL check |
| R2-160 | STILL_OPEN (low) | inline alert instead of crash; never print corrupt copy |

## Batch D — store / orders / QC / integrity
R2-185,186,187,188,189,191,192,193,194,195,196: ALREADY_FIXED at HEAD (grn.ts:679, store-books.ts:26, inventory.ts:101-126, job-phases.ts:407 / allocation-release.ts, orders.ts:289, qc.ts:218-223, print/coa latestVerdict, production.ts:584 sumByUnit, reports/page.tsx tz range, supplier-invoice.ts:88, bom.ts:358). Regression tests added only where missing (tests pass before and after = characterization tests).
R2-190: BY_DESIGN (PRODUCTION_LOGGED gate exists; no-phase-plan pass is D10).

## Batch E — employees / kiosk / APK
| ID | Class | Note |
|---|---|---|
| R2-177 | NEEDS_OWNER_DECISION (ops) | APK rebuild/distribution; R8 off |
| R2-178 | ALREADY_FIXED | bank-details.ts IFSC validation |
| R2-179 | NEEDS_OWNER_DECISION | break punches |
| R2-181 | NEEDS_OWNER_DECISION | pull-based revocation vs offline lockout |
| R2-182 | NEEDS_OWNER_DECISION | kiosk photo capture privacy |

## Batch F — test health
| ID | Class | Plan |
|---|---|---|
| R2-197 | STILL_OPEN | explicit timeout on wage-rule-keys scan |
| R2-198..209 | STILL_OPEN (env fragility) | all 12 needles match at HEAD on LF; fails on CRLF checkout. `\r?\n` normalisation + .gitattributes |

## Pending-retest rows ("Bug Resolved / Pending")
R2-91,117,118,119,120,121,122,123,128,129,130,131,132,133,134,135,137,143,144,145,148,149,150,154: ALREADY_FIXED (commits bf84efd, acb9faa, c41731e, ef64f16, 74502ad, e981c58; all before tester build). Awaiting tester retest, no code change.
R2-151 clamp and R2-153 test are the only residuals from this group.
