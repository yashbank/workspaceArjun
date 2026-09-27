# Production / wastage walkthrough (E6: MIS-147 → MIS-170)

_Phase 17. Depends on Phases 6, 7 and 11 — this phase tests what they build, and per their own
stamps much of it is already thoroughly tested. Read first, extend second; nothing here
duplicates what already exists._

## Automated (Vitest)

| Ticket | What | Proven by |
|---|---|---|
| MIS-147, MIS-165 | Every path around the phase gate — every ✗ cell in Appendix A §A.3 | `job-phases.test.ts` — the original "transition table" block already named 5 cells; this phase's own new `describe('every remaining ✗ cell…')` adds the other 9 (every `(from, verb)` pair not in `job-phases.ts`'s own `TRANSITIONS` table), including every `restorePhase`/`reopenPhase` case that had no status-guard test at all before. All refuse today — `assertTransition` already guards every verb correctly, unlike `bom.ts`'s F-37 (Phase 16) — so this locks the spec, it does not report a new bug. |
| MIS-150 | Clearance expiry + role boundaries | Expiry: `idempotency.test.ts` (Phase 11's own stamp — a log queued under a valid clearance and replayed after it expired parks, never applies or drops). Role boundaries: `line-clearance.test.ts` — "SUPERVISOR and above only" (D7). Cited, not duplicated. |
| MIS-156 | Lose the connection at every stage | `idempotency.test.ts` (40 tests, Phase 11's own stamp) — exactly-once under a race, live-vs-replay, actor mismatch. `queue-resolve.test.ts` (Phase 23, this session) adds the office-resolve half for a device that never reconnects at all. Cited. |
| MIS-159 | Trace a batch across several orders | `traceability-view.test.ts`'s `describe('the lot', …)` already traces one batch's post-receipt issues across TWO different orders in the same case (`ORD-2026-118` and a department-booked issue with no order) — cited, not duplicated (same pattern as Phase 15's MIS-66 finding). |
| MIS-162 | Totals tie out against a hand-checked fixture | **New** `src/test/fixtures/production-signoff.ts` — six fractional-quantity entries, the arithmetic worked by hand in the file's own comments (not trusted to the code under test), checked into the repo so the expected numbers are auditable. `job-phases.test.ts`'s sign-off-summary block asserts `getSignOffSummary` ties out to it exactly, including `wastePercent` to 10 decimal places. |
| MIS-165 | Sign-off cannot be faked or forced | Already covered: `only the in-charge signs (D12)` (4 tests — ADMIN refused, OWNER refused, names who can sign) plus the new ✗-cell block above (a stale/forced sign-off attempt from the wrong status is refused the same way F-37 showed `bom.ts` was NOT refusing). Cited + extended. |
| MIS-168 | Board correctness and performance at scale | Correctness: `machines-board.test.ts` (9 tests, Phase 8/20). **Performance at scale is honestly not testable here** — a fake in-memory db has no query cost to measure, so a passing "performance" unit test would prove nothing; this needs a real, loaded database or a staging environment (same class of limitation as Phase 20's MIS-84/89/93). Not run. |

## Manual (MIS-153, MIS-170 — a real supervisor, a printer, the client's blank BPR)

Not run this session (no device, no printer, no supervisor available). Numbered scripts for a
human to execute once those exist.

**MIS-153 — time the entry screen with a real supervisor.**
1. Sit with a supervisor at the production entry screen on their usual device.
2. Time a full entry (order → machine → quantity → save) start to finish, unprompted.
3. Note every point of hesitation or a wrong tap, not just the total time.
4. Compare against the two-tap target the design calls for; log any gap in `qa/FINDINGS.md`.

**MIS-170 — print a BPR beside the client's blank form.**
1. Print the job-card / BPR document (`/mis/print/job-card/[id]`).
2. Lay it beside the client's own blank BPR form (paper, not a screenshot).
3. Note every field present on one and not the other, and any layout mismatch that would
   confuse someone used to the paper form.
