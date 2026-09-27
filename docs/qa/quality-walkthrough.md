# Quality / COA / documents / reports walkthrough (E7: MIS-187 → MIS-267)

_Phase 18._

## Automated (Vitest)

| Ticket | What | Proven by |
|---|---|---|
| MIS-267 | Attendance report agrees with the payroll engine to the rupee | **New** `reports-payroll-agreement.test.ts` — runs both against the identical underlying `misAttendance` data. Found **new F-39**: they disagree. `getAttendanceReport` undercounts `present` (misses HALF_DAY, which `payroll.ts` counts) and undercounts `late` (checks only a literal `status === 'LATE'` the punch-derived day-builder never writes, instead of `lateMinutes > 0` the way `attendance.ts`'s own reader does). Ordinary PRESENT/ABSENT days without either edge case already agree, proven passing. |
| MIS-196 | AQL threshold change never moves a recorded decision | `rule-history.test.ts` already proves this **statically** (only `recordAqlSample` reads thresholds; the stored row has no rewritable column). **New** `qc-aql-decisions.test.ts` adds the **functional** proof the phase's acceptance check asks for: record a sample, tighten `AQL_MAJOR_MAX`, record another (now rejected), re-read the first — still `PASS`. Passes; locks the spec, no new bug. |
| MIS-199 | Reject, rework, re-sample, accept | There is no dedicated "rework" state anywhere in `qc.ts` or the schema — the workflow is entirely `recordAqlSample` called again after a rejection. `qc-aql-decisions.test.ts` proves this sequence end to end: a REJECT never blocks or taints a later, independent ACCEPT for the same order; both rows persist independently. |
| MIS-206 | Document versioning, permission, retrieval after rename | **Versioning is not built at all** — `MisDocument` has no `version`/`supersedesId` column (confirmed against `prisma/schema.prisma`), matching the already-logged **F-23** ("documents are name+link only"), re-confirmed, not a new discovery. There is also no rename/update function in `documents.ts` at all, so "retrieval after rename" has nothing to test. **New** `documents.test.ts` covers what does exist: permission gating (`orders.read` to list, `orders.write` to add/delete) and that the uploader is recorded by their auth id, not their profile id (the two are different UUIDs, per the module's own comment). |
| MIS-193 | Notification reaches everyone it should | MIS's only notification-writing path is `job-phases.ts`'s sign-off handover (`mis.phase_ready`) — already thoroughly covered (`job-phases.test.ts`'s "the handover notification" block: the next in-charge is notified, and sign-off still succeeds when they have no login at all, so nobody is silently blocked). Cited, not duplicated. The notification INBOX itself (reading/display) is a separate, already-logged gap (**F-29**: "no route or screen at all"), not this ticket's concern. |
| MIS-187, MIS-190 | Rebuild all three checklists; fill a full shift's grid | UI/component-level concerns (checklist screens, the QC hourly grid `getTodayQcBoard` already feeds) — not run as Vitest this session; `getTodayQcBoard`'s own data-correctness was already swept in Phase 20's "placeholder-wiring sweep" (no new drift found). A full manual walkthrough (fill a real shift's worth of grid cells, work through all three checklists on a device) needs a browser session this environment does not have this phase. |
| MIS-209 | Break the storage path deliberately | **Out of MIS's own module boundary, not a new gap to invent a test around.** `documents.ts`'s `addDocument` takes a `filePath` string it never validates or writes to disk — the actual file upload (and any storage failure) happens in the ROOT app's shared storage system (`src/server/storage`, `src/lib/storage-errors.ts`), which carries no `mis` path segment (CLAUDE.md's own MIS standing rule: "a path without a mis segment is wrong — ask"). No storage test file exists there either. Flagged as a scope question, not silently tested against code outside this module's ownership. |

## Manual (MIS-204, MIS-212, MIS-219 — the phase's own note: these are manual)

Not run this session (no browser, no real device, no three-years-of-data volume script).

**MIS-204 — overlay the generated COA on the original.**
1. Generate a COA from `/mis/print/coa/[id]`.
2. Overlay it on the client's original COA template (light-table or transparency).
3. Note every field misalignment or missing value.

**MIS-212 — trace at three years of data volume.**
1. Seed (or wait for) three years of production/GRN/order data.
2. Run a lot/batch trace (`traceability-view.ts`'s lot search) and time it.
3. Confirm the D4 visibility seam and near-miss rejection still hold at volume, not just on the
   small fixtures this session's tests use.

**MIS-219 — time the Owner dashboard on Arjun's device-locked account.**
1. On Arjun's own account and device, load `/mis` as Owner.
2. Time to first meaningful paint and to every card being populated.
3. Compare against what the design calls acceptable; log any gap.
