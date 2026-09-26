# DECISIONS.md — the assumed-decision registry

_Created 2026-09-15. The single editable place where every assumed decision lives._

**What this file is for.** The build could not wait for Arjun to answer four open
questions, so the client chose a default for each. Those defaults are recorded here —
once — and every phase of [`DEVELOPMENT_GUIDE.md`](./DEVELOPMENT_GUIDE.md) **cites the
D-number instead of restating the value**. Changing a decision is therefore an edit to
one row in this file plus a re-run of the phases named in that row. It is never a hunt
through twenty-two phase sections for a number somebody hard-coded.

**Status vocabulary.**

| Status | Meaning |
|---|---|
| **ASSUMED** | We chose it, we are building on it, Arjun has not confirmed it. |
| **CONFIRMED** | Arjun answered and agreed. Change the row, change nothing else. |
| **CHANGED** | Arjun answered differently. Update the value, then re-run the phases listed. |

**Rule for every agent:** if you need one of these values, cite `D1`…`D4` and read it
here. Do not copy the value into a phase section, a comment, a test name or a ticket. If
you find a phase that restates a value instead of citing it, fix the phase.

**Rule for the human:** when an answer comes back from Arjun, edit the **Value** and
**Status** cells of that one row, then run the phases in its *To change this* line. Nothing
else in the guide needs touching.

---

## Status board

| # | Question | Status | Confidence | Blocks |
|---|---|---|---|---|
| D1 | Where does buffer-stock cost land, and when? | **ASSUMED — awaiting Arjun** | Medium | Phases 20, 21 |
| D2 | Does a BOM-less PO need a different approval level? | **ASSUMED — awaiting Arjun** | Medium | Phase 21 |
| D3 | Which document does "PO" mean inside the MIS? | **ASSUMED — awaiting Arjun** | Medium | Phases 16, 21 |
| D4 | How deep is the hierarchy, and who sees whom? | **ASSUMED — awaiting Arjun** | **Higher — design evidence exists** | Phases 2, 8, 14, 20 |
| D5 | Do machines, orders and the attendance register narrow by pool at all? | **DECIDED — only people narrow by pool** | High — design evidence | Phases 8, 14, 20 |
| D6 | Who may edit AQL thresholds — Owner only, or Admin too? | **ASSUMED — awaiting Arjun** | Medium | Phase 5 |
| D7 | How long does a line clearance stay valid before the line must be re-cleared? | **ASSUMED — awaiting Arjun** | Low | Phase 6 |
| D8 | Must a production log always name a machine? | **ASSUMED — awaiting Arjun** | Medium | Phases 6, 11 |
| D9 | Is the order the job card, or can one order run several? | **ASSUMED — awaiting Arjun** | Medium | Phases 7, 11, 17 |
| D10 | Is an order with no declared phases gated? | **ASSUMED — awaiting Arjun** | Medium | Phases 7, 17 |
| D11 | Where does a wastage reason live, and when is it mandatory? | **ASSUMED — awaiting Arjun** | Medium | Phases 7, 17 |
| D12 | Who is a phase's in-charge, and what happens when they leave? | **ASSUMED — awaiting Arjun** | **Higher — live data evidence** | Phases 7, 17 |
| D13 | What is a phase's output read against, when orders carry no quantity? | **ASSUMED — awaiting Arjun** | Medium | Phases 7, 17 |
| D14 | Can production be logged against a closed order? | **ASSUMED — awaiting Arjun** | Medium | Phases 10, 11, 17 |
| D15 | Whose clock decides when an offline write happened? | **ASSUMED — awaiting Arjun** | **Higher — design evidence** | Phases 10, 11, 13, 19 |
| D16 | Which screens work with no signal? (the service worker's exact list) | **ASSUMED — awaiting Arjun** | Medium | Phases 11, 13, 20 |
| D17 | Which held writes can a plain retry release, and which need a person to vouch? | **ASSUMED — awaiting Arjun** | Medium | Phases 11, 17, 22 |
| D18 | How is a gate tablet enrolled, and who may pair or retire one? | **ASSUMED — awaiting Arjun** | **Higher — design evidence** | Phases 12, 13, 19 |
| D19 | What may a tablet pull, and how stale is too stale? | **ASSUMED — awaiting Arjun** | Medium | Phases 12, 13, 19 |
| D20 | What is a punch, and how is an attendance day derived from punches? | **ASSUMED — awaiting Arjun** | Medium | Phases 13, 19 |
| D21 | Corrections, the correction window, and unknown badges | **ASSUMED — awaiting Arjun** | Medium | Phases 13, 19, 23 |
| D22 | What timezone is "a day"? | **DECIDED from evidence — confirm the value with Arjun** | High | Phases 13, 19, 20, 23 |
| D23 | Who may say whose badge an unrecognised scan really was? | **ASSUMED — awaiting Arjun** | Medium | Phases 13, 23 |
| D24 | Who may see money — wages (S9), and also material rates and stock prices? | **Wages DECIDED (BRD S9); the rest ASSUMED — awaiting Arjun** | Medium | Phases 14, 16, 19, 20, 21 |
| D25 | Who may grant the Owner role, and may an Admin touch the Owner's record? | **ASSUMED — awaiting Arjun** | Medium | Phases 14, 14F |
| D26 | How is overtime paid? | **DECIDED by Yash (2026-09-20)** | — | Phase 25 |
| D27 | Which rate pays an attendance day, and when is a month final? | **ASSUMED — awaiting Arjun** | Medium | Phases 14F, 19, 25 |
| D28 | Extra-pay days and the multiplier basis | **DECIDED by Yash (2026-09-20)** | — | Phase 25 |
| D29 | What does a role with no dashboard widgets see? | **ASSUMED — awaiting Arjun** | Medium | Phase 24 |
| D30 | Who schedules a business-rule change, and is a reason required? | **ASSUMED — awaiting Arjun** | Medium | Phases 24, 25 |
| D31 | What is a document's link allowed to be, and what does the library group by? | **ASSUMED — awaiting Arjun** | Medium | Phases 24, 25 |
| D32 | How does a phone reach a screen that is not one of its five tabs? | **ASSUMED — awaiting Arjun** | Medium | Phase 24G |
| D33 | Payroll rework (25.1–25.5) — schema-level choices the brief left open | **ASSUMED by Phase 25 (2026-09-22)** | Low | Phase 25 |
| D34 | PO approval chain (D2) — how OWNER_ONLY / ADMIN_ONLY / BOTH are actually chosen | **ASSUMED by Phase 21 (2026-09-26)** | Medium | Phase 21 |

No phase is blocked by an unanswered question any more. Every phase builds on the assumed
value and cites its D-number, so a later answer costs a re-run of named phases rather than
a re-design.

---

## D1 · Buffer-stock costing — where the money lands and when

**Question.** A Purchase Order can now be raised for buffer stock with no BOM and no
customer order behind it. Where does that material's cost sit while it waits in the store,
and at what moment does an order's material cost get recognised?

**ASSUMED value.**
> A buffer-stock PO posts to a **general inventory pool**, not to any order. An order's
> material cost is recognised at **issue** time — the moment the storekeeper issues stock
> to that order — and never at purchase time. This applies to *both* PO paths: an
> order-linked PO also costs the order at issue, not at receipt.

**Status.** ASSUMED — awaiting Arjun. Confidence: medium.

**Rationale / evidence.**
- It is the only rule under which both PO paths reconcile. Both an order-linked PO and a
  buffer-stock PO end as the same physical material on the same shelf. If the order-linked
  one costed at purchase and the buffer one at issue, the same kilogram of board would be
  valued on two different bases and order profitability would never tie back to the store
  ledger.
- It is what the code already does: `CHANGE_PO_WITHOUT_BOM.md` records that material cost
  reaches an order when stock is **issued** to it, not when it is bought. Choosing anything
  else means rewriting the store issue path, not just adding to it.
- It keeps buffer stock honest rather than invisible: unissued buffer material is
  unattributed value sitting in the pool, which is a number you can look at, not a cost
  silently smeared over whichever order happened to be open.
- The known cost of this choice: if a storekeeper books an issue as "General" instead of
  "For order", that cost never reaches the order that consumed it. That drift is real and
  is the reason the buffer-drift report is scoped in Phase 21.

**Depends on this decision.**

| Files | Jira |
|---|---|
| `src/server/mis/store.ts` (`commitIssue`, `commitReceipt`) | MIS-275 |
| `src/server/mis/po.ts`, `src/server/mis/grn.ts` | MIS-279 |
| `src/server/mis/reports.ts` (buffer-drift report) | MIS-292 |
| `src/server/mis/bom.ts` (BOM costing surface) | MIS-294 |
| `src/lib/mis/po-purpose.ts` | MIS-295 |
| `docs/CHANGE_PO_WITHOUT_BOM.md` §4, §7 | MIS-120 |

**To change this:** edit the ASSUMED value above, then re-run **Phase 20** (MIS-279's
buffer-stock cases) and **Phase 21** (the drift report and any costing surface). Phase 0
needs no re-run.

---

## D2 · Approval threshold for a BOM-less PO

**Question.** Should a buffer-stock PO — money spent with no customer waiting for it —
need a different level of approval from a PO raised against a customer's order?

**ASSUMED value.**
> **Identical monetary thresholds to order-linked POs. No special rule.** Purpose is not
> an axis of the approval decision. One threshold table governs every PO regardless of
> whether a BOM sits behind it.

**Status.** ASSUMED — awaiting Arjun. Confidence: medium.

**Rationale / evidence.**
- No purpose-aware threshold exists today: `src/server/mis/po.ts` has
  `submitForApproval` / `approvePO` as a single step, with no tiering at all (MIS-275 is
  PARTIAL for exactly this reason). There is nothing to preserve.
- Building an approval rule Arjun has not asked for is precisely the rework this plan
  exists to prevent. A second axis added on a guess costs a migration, a screen and a test
  suite to remove.
- One rule also means `prisma/migrations-pending/20260915000000_mis_po_purpose/` stays
  unapplied until there is a reason to apply it — which is what
  `CHANGE_PO_WITHOUT_BOM.md` §6 asked for.
- Adding a purpose axis later is additive (a `purpose` column in the threshold lookup).
  Removing one that was guessed wrong is not.

**Depends on this decision.**

| Files | Jira |
|---|---|
| `src/server/mis/po.ts` (`approvalMode`, threshold check) | MIS-275 |
| `src/server/mis/approvals.ts` | MIS-295 |
| `src/server/mis/business-rules.ts` (threshold seeds) | MIS-279 |
| `src/components/mis/approvals/approvals-screen.tsx` | MIS-123 |
| `prisma/migrations-pending/20260915000000_mis_po_purpose/` | MIS-278 |

**To change this:** edit the ASSUMED value above, then re-run **Phase 21** (the approval
chain itself) and **Phase 20** (MIS-279's approval-chain cases).

---

## D3 · What "PO" means inside the MIS

**Question.** "Purchase Order" names two different pieces of paper — the one the customer
sends us, and the one we send a supplier. Which one does the MIS mean?

**ASSUMED value.**
> Inside the MIS, **"PO" means the supplier purchase order we raise** (PO → GRN → stock).
> The customer's own purchase order is **"Customer PO"**, and it is captured as a
> *reference on the Order*, not as a PO record. This matches the W2-PO-capture design.
> **E5 tickets that say "PO" mean Customer PO.**

**Status.** ASSUMED — awaiting Arjun. Confidence: medium.

**Rationale / evidence.**
- The entire built chain is supplier-side: `src/server/mis/po.ts` → `grn.ts` → `store.ts`,
  routes `/mis/po` and `/mis/grn`, screens `po-list-screen.tsx` / `po-detail-screen.tsx`.
  `MIS_UI_SPEC.md` §6 describes PO purposes in supplier terms ("materials a BOM asked
  for", "a top-up of stock the factory keeps on hand").
- Arjun's own change request — raise a PO with no BOM, for buffer stock — is only coherent
  about the supplier PO. A customer does not send you a PO for your own buffer stock.
- E5 is the customer side (order → BOM → job card). Its "PO" tickets (MIS-134's *real
  sample PO*, MIS-129's *PO → order → BOM → approval → job card*) are about the document
  the customer sent, captured as a reference on the Order. Reading them as supplier POs
  inverts the whole epic.
- No model rename and no route change follows from this either way. The only change D3
  can cause is **screen copy**.

**Depends on this decision.**

| Files | Jira |
|---|---|
| `src/server/mis/po.ts`, `grn.ts`, `orders.ts` | MIS-129 |
| `src/components/mis/po/**`, `src/components/mis/orders/**` | MIS-134 |
| Routes `/mis/po`, `/mis/grn`, `/mis/orders` | MIS-111 |
| `src/lib/mis/i18n/**` (the two labels) | MIS-275 |
| `docs/MIS_UI_SPEC.md` §6 | MIS-278, MIS-295 |

**To change this:** edit the ASSUMED value above, then re-run **Phase 16** (E5 QA — the
walkthroughs and copy assertions) and **Phase 21** (the rename pass). Screen copy only;
never rename a model, a column or a route on the strength of this decision.

---

## D4 · Hierarchy depth and pool visibility

**Question.** How deep is the reporting hierarchy, and which people does each role see?

**ASSUMED value.**
> **3 levels: Owner → Admin / Supervisor → Worker.** A user sees **their own subtree
> only**. An Admin therefore sees Workers and Supervisors, but **not other Admins and not
> the Owner**. The scope is applied **in the Prisma query** — a `where` fragment the
> resolver returns — and **never by filtering in the client**.

**Status.** ASSUMED — awaiting Arjun. **Confidence: higher than D1–D3 — this one has
design evidence behind it, not only reasoning.**

**Rationale / evidence.**
- **The R4-Admin design note.** The approved Admin screen was drawn without any
  owner-level or peer-admin surface on it. `MIS_UI_SPEC.md` §4.5 gives ADMIN the tabs
  `Home · Orders · Masters · People · Reports` — no Settings tab and no Approvals tab,
  both of which are Owner surfaces. §4.6's Admin home is orders, attendance counts and
  data health: operational, downward-looking, nothing peer or upward. A designer who
  intended Admins to see each other would have had to draw somewhere for that to appear,
  and did not.
- `mis_employees.managerId` is a **single** self-relation. Three levels and one manager
  per person is exactly what the existing column can express; anything deeper or
  many-to-many needs a schema change nobody has asked for.
- Client-side filtering is not a variant of this decision, it is a bug: a list filtered in
  the browser has already been sent to the browser. The permission matrix in
  `src/lib/mis/permissions.ts` answers *may you*, and the resolver answers *which rows* —
  they are different questions and both are server-side.

**Still open inside D4 (assume the default, flag it to Arjun).** Can one worker sit in two
supervisors' pools — shared between Printing and Lamination? **Assumed NO:** one manager
per employee. This is the only part of D4 the design evidence does not settle, and it is
the part most likely to come back changed.

**Depends on this decision.**

| Files | Jira |
|---|---|
| `src/server/mis/visibility.ts` (**new**, Phase 2) | MIS-10 |
| `src/server/mis/employee.ts`, `machines-board.ts`, `orders.ts`, `attendance.ts` | MIS-47, MIS-48 |
| `src/server/mis/worker-allocation.ts` (**new**, Phase 8) | MIS-260, MIS-262, MIS-263 |
| `src/lib/mis/permissions.ts` | MIS-49 |
| `src/components/mis/**` pickers (empty states) | MIS-98, MIS-264 |

**To change this:** edit the ASSUMED value above, then re-run **Phase 2** first (the
resolver is the only place the rule is written), then **Phase 8**, **Phase 14**
(MIS-49 cross-role visibility) and **Phase 20** (MIS-98, MIS-264). Because every list
composes the one resolver, a changed D4 is a one-file change plus its tests — which is the
entire reason Phase 2 exists.

---

## D5 · Does anything other than people narrow by pool?

| | |
|---|---|
| **Question** | Do machines, orders and the attendance register narrow by pool, or only people? |
| **Status** | **DECIDED from design evidence (2026-09-17)** — high confidence, confirm in passing with Arjun |
| **Decided value** | **Only people narrow by pool.** Machines, orders and the attendance register are plant-wide for every role that can read them at all. Permission still gates *whether* a role sees them; D4's subtree scoping does not. |
| **Rationale** | `R2-Supervisor.png` settles it in the artboard's own note: people are pool-scoped so a supervisor sees only his crew, but machines are not — "All 21 visible" is printed on the card deliberately, because he cannot plan around a press he cannot see, and a machine booked by another department is exactly what he most needs to know about. The note explicitly warns against "fixing" this later by applying the visibility filter uniformly. Orders follow the same logic: a supervisor produces against an order, so hiding it breaks planning. The attendance register is recorded at the gate for everyone, and Phase 2 already gave the kiosk an explicitly unscoped roster. |
| **Depends on it** | `src/server/mis/visibility.ts` (stays people-only), machine board, order lists, attendance register, Phase 8 allocation, Phases 14 and 20 QA |
| **To change** | Extend `visibility.ts` to the entity in question and thread the scope through its list function. Do not do this casually — the supervisor home's "All 21 visible" label would become a lie, and that label exists to stop exactly this change. |
| **Ask Arjun** | "Your supervisors see only their own crew, but every machine and order in the plant. Correct?" |

## D6 · Who may edit AQL thresholds?

| | |
|---|---|
| **Question** | Should AQL accept/reject thresholds be Owner-only, or editable by Admin? |
| **Status** | **ASSUMED — awaiting Arjun** (decided by Phase 5, recorded retroactively) |
| **Assumed value** | Owner-only. New `aql.read` permission, same shape as `wages.read`. AQL thresholds are excluded from Admin's general settings list and live on their own `/mis/settings/aql` screen. |
| **Rationale** | A threshold edit silently changes the pass/fail outcome of every future sample, so it behaves like a commercial control rather than a routine setting. Phase 5 also made check rows immutable and snapshots thresholds into the audit log, so a later edit never re-scores a past decision (MIS-272). |
| **Depends on it** | `src/lib/mis/permissions.ts` (`aql.read`), `src/server/mis/qc.ts` (`recordAqlSample`), `/mis/settings/aql`, QC detail `AqlBreakdown` |
| **To change** | Move `aql.read` into the ADMIN block in `permissions.ts` and surface the screen in Admin's settings list. No data migration. Re-run nothing. |
| **Ask Arjun** | "Should your plant Admin be able to change the AQL accept/reject thresholds, or is that yours alone? A threshold change affects every future batch decision." |

---

## D7 · Line clearance validity window

| | |
|---|---|
| **Question** | How long does a line clearance stay valid before it must be re-done? |
| **Status** | **DECIDED by Yash (2026-09-16)** — confirm wording with Arjun, but build it |
| **Decided value** | Validity is a **mode**, stored as a business rule and editable without a deploy. Three modes: `JOB` (expires when that machine's current order changes — the default), `SHIFT` (expires at the end of the shift it was granted in), `MINUTES` (fixed duration, the original 120-minute behaviour). A separate optional **max-minutes cap** applies on top of `JOB` and `SHIFT`: whichever limit comes first wins. |
| **Rationale** | A clearance certifies that a machine was verified for a specific setup. A job change invalidates that physically; a shift change means different people on the line. Both are real invalidation events that a clock alone misses. The cap exists because a long run would otherwise coast for days on one clearance. `MINUTES` is kept so the rule can always be forced to a plain timer. |
| **Depends on it** | `MisLineClearance` (needs `mode`, `orderId`, `shiftId`, and reuses `validityMinutes` as the cap), `src/server/mis/production.ts` clearance check, supervisor home amber blocker, Phase 6 MIS-148/149 |
| **To change** | Edit the `line_clearance.mode` business rule (and `line_clearance.max_minutes`). Effective-dated, so past clearances keep the mode snapshotted on their own row and are never re-scored. |
| **Ask Arjun** | "A line clearance expires when the machine changes job, or at end of shift — with an optional maximum age. Which should be the default, and what maximum?" |

---

## D8 · Must a production log always name a machine?

| | |
|---|---|
| **Question** | `MisProductionLog.machineId` was nullable — production could be logged with no machine attached. D7's line clearance is machine-scoped, so Phase 6 made `machineId` a **required** argument on `logProduction()` to make the precondition enforceable at all. Is that the right call, or does some production (hand-finishing, packing) legitimately have no machine? |
| **Status** | **ASSUMED by Phase 6 (2026-09-19)** — confirm with Arjun, but built and shipped |
| **Assumed value** | **Yes, always.** `logProduction()`'s `machineId` is now `string` (required), not `string?`. Both production screens (`production-screen.tsx`, `production-detail-screen.tsx`) now require a machine selection before the Log button enables. |
| **Rationale** | A line-clearance check with no machine to check is not a check — D7's precondition is meaningless without one. The column stayed nullable at the schema level (no migration needed), so relaxing this later is a one-line change to the function signature, not a schema change. |
| **Depends on it** | `src/server/mis/production.ts` (`logProduction`), `src/server/mis/line-clearance.ts` (`assertLineCleared`), `src/components/mis/production/production-screen.tsx`, `src/components/mis/production/production-detail-screen.tsx`, Phase 11 (offline queue must carry the same requirement through) |
| **To change** | If a real hand-process has no machine, make `machineId` optional again on `logProduction()` and skip `assertLineCleared` when absent — but that reopens the gap D7 was built to close, so get Arjun's answer before doing it. |
| **Ask Arjun** | "Every production log will now need a machine selected, because clearance is checked per machine. Is there any production step — hand-finishing, packing — that genuinely has no machine and needs an exception?" |

---

## D9 · Is the order the job card?

| | |
|---|---|
| **Question** | MIS-145 specifies `MisJobPhase.jobCardId`. There is no `MisJobCard` model in the schema and never has been — `/mis/print/job-card/[id]` takes an **order** id and renders the order plus its BOM. So is a job card just an order under another name, or a separate thing an order can have several of? |
| **Status** | **ASSUMED by Phase 7 (2026-09-19)** — build on it, but this is the one to put to Arjun first |
| **Assumed value** | **The order is the job card.** Phase state is keyed on `MisJobPhase.orderId`; one order carries exactly one ordered run of phases. |
| **Rationale** | It is what the code already means by "job card" (the print route), and nothing in the schema can express a second one. Inventing a `MisJobCard` table nobody asked for, to hold a foreign key and nothing else, is the rework this plan exists to prevent. |
| **The risk if this is wrong** | If one order really can have two job cards running at once — two batches of the same product on different lines — then keying phase state on `orderId` **collapses them into one sequence**, and signing off Printing on batch A would unblock Lamination on batch B. That is a silent correctness failure, not a missing feature. |
| **What changes if Arjun says yes** | A nullable `job_card_id` column on `mis_job_phases`, the partial unique index widening from `(order_id, sequence)` to `(order_id, job_card_id, sequence)`, and the sequential-gate trigger's lookup gaining `AND job_card_id IS NOT DISTINCT FROM NEW.job_card_id`. The server module changes in one place — the predecessor lookup in `job-phases.ts`. Scoped in advance so the answer costs a migration and one function, not a redesign. |
| **Depends on it** | `MisJobPhase` (whole model), `src/server/mis/job-phases.ts`, the DB trigger and partial unique index, Appendix A §A.1/§A.5, Phase 11 (replay keys on the phase), Phase 17 (MIS-147/165 gate tests) |
| **To change** | Add the nullable column as above and re-run **Phase 7** (the trigger and the resolver) and **Phase 17** (the gate tests). No data migration — existing rows take `job_card_id IS NULL`, which reads as "the order's only job card". |
| **Ask Arjun** | "Can one order ever have more than one job card running at once?" |

---

## D10 · Is an order with no declared phases gated?

| | |
|---|---|
| **Question** | The handover gate only exists for orders that have `MisJobPhase` rows. What happens to an order that has none — the fifteen already live, and every future one nobody has planned yet? |
| **Status** | **ASSUMED by Phase 7 (2026-09-19)** |
| **Assumed value** | **Not gated, and the absence is stated on screen.** An order with zero phases accepts production exactly as it does today. The order detail shows **"No phase plan · not gated"**, so the missing gate is visible rather than silent. |
| **Rationale** | The live database holds 15 orders, 7 BOMs and 30 BOM stages with no phases. Gating them would stop production on day one for every job card nobody has planned, which is how a control gets switched off entirely. The danger of the softer rule is that an ungated order *looks* like a passed gate — so it is labelled. A gate that is off and says so is honest; one that is off and silent is a lie the screen tells. |
| **Depends on it** | `logProduction()` phase resolution (`src/server/mis/production.ts`), `src/server/mis/job-phases.ts`, order detail screen (`src/components/mis/orders/**`), Appendix A §A.8 |
| **To change** | If Arjun wants every order gated, make the "no phases" branch refuse instead of pass, and backfill phases for open orders first — the backfill is the expensive half, not the code. Re-run **Phase 7** and **Phase 17**. |
| **Ask Arjun** | "Some orders have no phase plan yet. Should production on those be blocked until someone plans the phases, or allowed through with a 'not gated' label on the order?" |

---

## D11 · Where does a wastage reason live, and when is it mandatory?

| | |
|---|---|
| **Question** | MIS-142 and MIS-163 make "every wastage figure has a reason" a sign-off precondition. `mis_production_log` has `qty_waste` and a free-text `notes`, and no reason field. Where does the reason go, and is it required at entry or only at sign-off? |
| **Status** | **ASSUMED by Phase 7 (2026-09-19)** |
| **Assumed value** | A new nullable `waste_reason` column on `mis_production_log`. It is **not** required when production is recorded — the 2–3 tap screen stays two taps — and **is** required, for every entry with `qtyWaste > 0`, before the phase can be signed off. The sign-off screen collects the missing ones inline. |
| **Rationale** | Requiring it at entry would put a text field in the middle of the fastest, most-used write in the app, and a supervisor mid-run does not know yet why the shift wasted what it wasted. Sign-off is where the phase is looked at as a whole, which is exactly where the client's own form asks for it (`Batch Production Record_BPP.pdf` p4, the wastage reconciliation sheet's Remarks column). `notes` was not reused: it is already a general-purpose field and overloading it makes "did anyone give a reason" unanswerable by query. |
| **Scope note** | The column is nominally **MIS-160**'s (E6-06, "wastage aggregates and the sign-off reason requirement"), which `TICKET_INVENTORY.md` marks YES on the strength of the aggregates alone — the reason half was never built. Phase 7 adds the column because MIS-163 cannot enforce its own acceptance criteria without it. Phase 17 is stamped. |
| **Depends on it** | `mis_production_log.waste_reason`, `signOffPhase()` precondition 2, sign-off screen inline prompt, Phase 17 (MIS-160/162) |
| **To change** | If wastage reasons should be structured rather than free text, replace the column with an FK to a reason master and seed it from the client's own list. Re-run **Phase 7** and **Phase 17**. |
| **Ask Arjun** | "Should the wastage reason be free text, or picked from a fixed list you give us? And is it fair to ask for it at sign-off rather than at every entry?" |

---

## D12 · Who is a phase's in-charge, and what happens when they leave?

| | |
|---|---|
| **Question** | MIS-142 says only the in-charge may sign off a phase. Who becomes the in-charge, and how does a job card get unstuck when that person cannot sign — they left, or they have no login? |
| **Status** | **ASSUMED by Phase 7 (2026-09-19)**. Confidence higher than D9–D11: this one is driven by the live employee data, not by reasoning. |
| **Assumed value** | The in-charge is **whoever started the phase**, unless one was explicitly assigned first. **Nobody else may sign — not ADMIN, not the Owner.** The Owner/Admin lever is `reassignInCharge()`, which is audited and records the outgoing in-charge; it is not a way to sign on someone's behalf. |
| **Rationale** | Of the 16 OWNER/ADMIN/SUPERVISOR employees in the live database, **3 have a login and 3 have a department**. Defaulting the in-charge by department lookup (`MisProcess.departmentId` → that department's supervisor) resolves to nobody for almost every process, and an in-charge who cannot log in is a permanently stuck job card. A stuck gate is what produces the paper workaround this feature exists to kill. Letting the Owner sign instead destroys the one thing the signature is for — MIS-142: "a signature someone else can apply is not a signature". Reassignment keeps both properties: the gate moves, and every signature still belongs to the person who made it. |
| **Depends on it** | `mis_job_phases.in_charge_employee_id`, `startPhase()`, `signOffPhase()` identity check, `reassignInCharge()`, `phase.write` grants in `src/lib/mis/permissions.ts`, Appendix A §A.4 |
| **To change** | If Arjun wants a fixed in-charge per process, add `in_charge_employee_id` to `MisProcess` and default from there — the default is one function in `job-phases.ts`. If he wants the Owner able to sign for an absentee, that is a change to the identity rule, and it should be recorded here as a deliberate weakening rather than slipped in. Re-run **Phase 7** and **Phase 17**. |
| **Ask Arjun** | "When a section in-charge leaves or is off sick, should a manager be able to re-assign who signs off that phase — or should the manager be able to sign it themselves? We have built re-assignment, because a signature someone else can apply stops meaning anything." |

---

## D13 · What is a phase's output read against?

| | |
|---|---|
| **Question** | MIS-164 asks for phase output to be shown "against the job quantity so a wildly wrong figure is obvious at a glance". `MisOrder` has no quantity column — not on the order, not on the BOM. So what is the denominator? |
| **Status** | **ASSUMED by Phase 7 (2026-09-19)** |
| **Assumed value** | **What the previous signed-off phase handed over.** The sign-off summary shows `980/1,000` — this phase's output over the output of the phase before it — and names that phase. When there is no previous signed phase, the figure stands alone with no denominator rather than inventing one. |
| **Rationale** | It is what the client's own form does: the BPR runs "Received Sheets → Printed Sheets → Wastage" down each section, so every section is read against what the one before it passed on. It is also the comparison that catches the error MIS-164 is worried about — a phase that reports more output than it was given sheets for is visibly wrong, and an order-level target would not catch it at all. Adding a quantity column to `MisOrder` on a guess would put a number on every order that nothing validates and nothing maintains. |
| **Depends on it** | `getSignOffSummary()` (`handedOver`), `src/components/mis/production/sign-off-screen.tsx`, Phase 17 (MIS-162's hand-checked fixture) |
| **To change** | If Arjun wants a true ordered quantity, add `quantity` + `unit` to `MisOrder`, populate it at order entry, and show output against that instead — `handedOver` stays useful as the second line. One migration, one function, one card. Re-run **Phase 7** and **Phase 17**. |
| **Ask Arjun** | "An order does not record how many pieces were ordered anywhere in the system. Should it? Right now each section's output is shown against what the previous section handed over, which is what your BPR form does." |

---

## D14 · Can production be logged against a closed order?

| | |
|---|---|
| **Question** | `logProduction()` has never checked order status — production can be recorded against a `DELIVERED`, `COMPLETED` or `CANCELLED` order today, online, with no refusal. Phase 10's offline contract needs "order closed" to be a park reason, which it cannot be unless closure actually refuses the write. Should it? |
| **Status** | **ASSUMED by Phase 10 (2026-09-19)** — Phase 11 implements it |
| **Assumed value** | **No — a closed order refuses production**, online and on replay alike (`CLOSED_ORDER_STATUSES` in `orders.ts` already names the three). The refusal is **not permanent**: `reopenOrder(orderId, reason)` — `orders.write`, reason required, audited — puts the order back in play, after which a parked entry replays and applies cleanly. |
| **Rationale** | A figure that can change after an order is delivered and invoiced is a figure nobody can rely on; the check has to sit on the write path, not in the queue, or the live and replayed paths drift into two different rules. But a refusal with no route through is a dead end, and a dead end in front of a legitimate late correction is what sends somebody to edit the database by hand. Reopen deliberately mirrors Appendix A's phase reopen so the whole system has **one mental model: the world must change before the write lands, and a named person changes it on the record.** |
| **Why `orders.write` and not Owner-only** | Anyone holding `orders.write` can already move an order's status freely through `updateOrderStatus()` with no reason at all. Making the *documented, reasoned* path stricter than the undocumented one already in the codebase would push people toward the worse route. Tightening to Owner-only later is a one-line change. |
| **Depends on it** | `src/server/mis/production.ts` (`logProduction`), `src/server/mis/orders.ts` (`reopenOrder`, **new**), Appendix B §B.5.4, Phase 11, Phase 17 QA, Phase 23 inbox |
| **To change** | If Arjun wants closed orders to stay writable, drop the check and the `ORDER_CLOSED` park reason with it. If he wants reopening to be his alone, move the gate to a new `orders.reopen` action. Re-run **Phase 11** and **Phase 17**. |
| **Ask Arjun** | "Once an order is delivered or cancelled, should the system still accept production entries against it? We now refuse, but anyone who can edit orders can reopen one — with a reason on the record — if a late entry turns out to be genuine." |

---

## D15 · Whose clock decides when an offline write happened?

| | |
|---|---|
| **Question** | A punch made at 06:04 on a tablet with no signal reaches the server at 07:41. A sign-off made offline would reach it later still. Which time is the real one — the device's or the server's? And what happens when the device's clock is simply wrong? |
| **Status** | **ASSUMED by Phase 10 (2026-09-19)**. Confidence higher than most: the design sheet settles half of it outright. |
| **Assumed value** | **It depends on the kind of write, and the two kinds are named.** *Client-recorded* writes (attendance punches, a production entry's `loggedAt`) take the device's time as the business time — a 06:04 punch is a 06:04 punch however late it syncs. *Server-stamped* writes (sign-offs, audit rows, every `createdAt`) take the server's clock at the moment they apply, and no client value ever reaches those fields. `clientRecordedAt` is stored raw on **every** queued write regardless, as evidence. A client-recorded time outside tolerance — in the future, or older than the queue's age limit — is **parked for a human, never clamped and never discarded**. |
| **Rationale** | `K2-Offline-sync-queue.png` shows punches listed at 06:04 and 06:11 while the queue syncs at 07:41: the design already decided that a worker who punched at six was not late because the tablet found signal at half seven. Attendance decides pay, so the alternative is indefensible. Sign-off is the mirror image — MIS-163 and Appendix A §A.6 both insist the server stamps it, because a backdated signature would let the whole gate be reconstructed after the fact. Clamping a wrong clock to `now()` is the worst of both: it destroys the only evidence that a device's clock is broken, and quietly moves a punch into a different day, shift or pay period. |
| **The numbers are business rules, not constants** | `offline.clock_skew_minutes` and `offline.max_queue_age_hours`, effective-dated in `business-rules.ts` — the same mechanism D7 uses, editable without a deploy. Only the *policy* above is the decision. |
| **Depends on it** | `src/lib/mis/offline/**`, `src/server/mis/idempotency.ts`, `logProduction()`, `clockIn`/`clockOut`, Appendix B §B.4, Phases 11, 13, 19 QA |
| **To change** | If a punch should count from when it *arrives*, flip the punch kinds to server-stamped — but read D15's rationale first, because that changes what people are paid. The tolerance and age limit need no code change at all. |
| **Ask Arjun** | "If the gate tablet loses signal at 6am and reconnects at 8, the punches still count at the time people actually arrived — 6:04, not 8:00. And if a tablet's own clock is badly wrong, we hold those punches for someone to check rather than guessing. Is that right?" |

---

## D16 · Which screens work with no signal? — the service worker's exact list

| | |
|---|---|
| **Question** | Phase 10 built a queue that keeps *writes* safe offline, but a queue is useless if the screen it feeds will not load. Which screens should be reachable with no network — and, just as important, which should not? |
| **Status** | **ASSUMED by Phase 11 (2026-09-20)** — scope set by Phase 10's stamp on Phase 11, listed here so it cannot widen by accident |
| **Assumed value** | **Exactly two documents work offline: `/mis/production` and `/mis/kiosk`.** Everything else in the MIS is online-only by design. The worker is registered with scope `/mis/`. **Static assets:** only `/_next/static/**` files *discovered from those two documents* (their scripts, their stylesheets, and the fonts those stylesheets reference) — served cache-first when already cached; a miss goes to the network and is **never added**. **Navigation** to the two routes is network-first with a 4-second timeout, falling back to the cached document. **Any other navigation** inside the scope goes to the network only; if that fails the worker answers with a small inline "you are offline" page that links to the two cached routes — that page is a string in `sw.js`, not a cached route. **Never intercepted:** non-GET requests, React Server Component flight responses (`RSC` header or `_rsc` query), `/api/**`, and server actions — so *data is never served stale from cache*. The cache is **wiped when a different user announces themselves**, so one person's cached pages are never shown under another's session. |
| **Not offline, on purpose** | `/mis` (the home), `/mis/production/[id]` (a dynamic route — its ids cannot be known in advance), every other screen. Opening the installed app cold with no signal lands on the inline offline page, which links to the two that work. |
| **Rationale** | A supervisor who cannot record production because the wifi dropped is the failure this whole phase exists to prevent — but making every route offline-capable means caching data that goes stale, and *"a supervisor acting on yesterday's machine list is worse than one who knows he is offline"* (Phase 10). So the list is short and named. The document itself carries the last-loaded machine and order lists, which is unavoidable and is why the production screen **states** "lists as of HH:MM" whenever it is offline **or the page it is showing is more than 5 minutes old** (a worker that fell back after a dead-link timeout is offline in every way that matters while the browser still says otherwise): stale data that says it is stale is honest, and stale data that does not is a lie. Fonts are in scope because `next/font` self-hosts them under `/_next/static/media/`, referenced from CSS rather than HTML — leaving them out would swap the typeface mid-shift and shift the layout. |
| **The guard against widening** | `ALLOWED_DOCUMENTS` in `public/sw.js`, and a test (`src/lib/mis/offline/sw.test.ts`) that asserts it equals the two routes above and that no other pathname is ever cached. Adding a route means editing this row **and** that test — which is the point. |
| **Known residual** | The MIS shell has no sign-out control of its own (the file-manager topbar signs out client-side), so caches are wiped on the *next* user's arrival, not at the moment of sign-out. The cached pages contain no wage data — production entry lists orders and machines only — but they do contain the previous user's name in the header until then. |
| **Depends on it** | `public/sw.js`, `src/components/mis/shell/service-worker-registration.tsx`, `src/proxy.ts` (`/sw.js` exempted from the login redirect — a redirected worker script is a hard registration failure), Phase 13 (the kiosk route is already in the list; it must not add routes), Phase 20 QA |
| **To change** | Edit `ALLOWED_DOCUMENTS`, this row, and the `sw.test.ts` assertion together. Bump `CACHE_VERSION` so old caches are pruned. Re-run **Phase 11** and **Phase 20**. |
| **Ask Arjun** | "When the factory wifi drops, the Record production screen and the gate kiosk screen keep working from the machine, order and employee lists they last loaded — and say so on screen. Everything else needs a connection. Is that the right split, or is there a third screen that has to keep working?" |

---

## D17 · Which held writes can a plain retry release, and which need a person to vouch?

| | |
|---|---|
| **Question** | Appendix B parks a write that was legal when queued and illegal on arrival. Some parks clear when the world changes (an order is reopened); others cannot be cleared by *changing the world* at all, because what is in doubt is whether the original act was legitimate. Which is which, and who releases each? |
| **Status** | **ASSUMED by Phase 11 (2026-09-20)** — derived from Appendix B §B.5's own text and made explicit; Appendix B §B.10.4 carries the table |
| **Assumed value** | **A plain retry may release a park only when the blocker was a *state of the world* a named person changed on the record:** `ORDER_CLOSED` (order reopened), `PHASE_SIGNED_OFF` / `PHASE_NOT_ACTIVE` / `PHASE_AMBIGUOUS` (phase reopened or started), `FORBIDDEN` (right granted, or the original user signed back in), `UNKNOWN`. A retry re-runs **every** gate and lands only if they pass; it forces nothing. **It may not release** `CLEARANCE_EXPIRED` / `CLEARANCE_MISSING` or `CLOCK_SKEW` / `TOO_OLD` — those need an *audited override* by a person who can vouch (built by the inbox phase). A `REJECTED` entry is never replayed; its fix is a new entry under a new key. A retry that lands records who released it and when. |
| **Rationale** | For a clearance the doubt is not "is the line clear now?" — re-clearing answers that — but "was the line clear *when this was done*?", and a clearance granted at 16:45 certifies nothing about a setup at 14:05. Letting a re-clear-and-retry release the park would quietly turn an expired clearance into a valid one, which is precisely the "quietly forced" outcome Appendix B forbids and the reason D7 exists. Clock skew is the same shape: only a person can vouch for a time the device got wrong. Order and phase parks are different in kind — the record a person changed (a reopened order, a reopened phase) is itself the on-record answer, so the retry only has to re-check it. |
| **Depends on it** | `RETRYABLE_PARK_REASONS` in `src/lib/mis/offline/idempotency.ts`, the `retry` option in `src/server/mis/idempotency.ts`, the sync indicator's Retry button (shown only for retryable reasons), Phase 17 QA, the inbox phase |
| **To change** | Move a reason in or out of `RETRYABLE_PARK_REASONS`. Moving a clearance reason *in* is a deliberate weakening of D7 and should be recorded here as one. Re-run **Phase 11** and **Phase 17**. |
| **Ask Arjun** | "If a supervisor's production entry was held because the order had been closed, and an admin reopens the order, should the entry send itself when the supervisor taps Retry? And if it was held because the line clearance ran out — should clearing the line again be enough to release it, or should someone with clearance rights have to confirm the earlier production really happened under a cleared line?" |


## D18 · How is a gate tablet enrolled, and who may pair or retire one?

| | |
|---|---|
| **Question** | A tablet on the factory floor holds a credential indefinitely, and it is the most stealable device in the building. Who starts pairing, who approves it, what does the tablet hold afterwards, and what happens when it is retired? |
| **Status** | **ASSUMED by Phase 12 (2026-09-20)** — from `K10-Device-enrolment.png`, which is more specific than the phase's one-line acceptance check |
| **Assumed value** | **The tablet asks; an Admin grants.** The tablet requests pairing and shows a short one-time code; an **Owner or Admin** types it into Settings → Devices and names the tablet; the tablet then collects its bearer token **once**. The code expires in **ten minutes** and is single-use. The tablet **never holds a user's credentials** — only its own device token, stored **hashed** server-side, so a database read cannot impersonate it. **Revoking** is Owner/Admin, takes effect on the next request, and tells the tablet to wipe its local list; a revoked device's **queued punches are still accepted** (they are real events), attributed to it and flagged. New action **`kiosk.manage`** (OWNER, ADMIN) for pair, rename and revoke; viewing kiosk health for the attendance card needs only `attendance.read`. The unauthenticated pairing request is capped (a fixed number of unexpired pending rows) so it cannot be used to fill the table. |
| **Rationale** | K10 states it in its own words: "A tablet that could enrol itself is a tablet anyone can add to the factory." The phase text says "Owner/Admin-initiated"; K10 is Admin-**authorised** with the device initiating — the same guarantee (nothing joins without an Admin's act) without an Admin having to type a hardware description into the portal first. A punch from a retired tablet is not invalid: dropping it would lose real attendance, which is the failure Appendix B exists to prevent. |
| **Depends on it** | `MisKioskDevice`, `src/server/mis/kiosk-device.ts`, `src/app/api/mis/kiosk/**`, `src/lib/mis/permissions.ts` (`kiosk.manage`), Phase 13 (punch ingestion must accept a revoked device's punches), Phase 19 QA |
| **To change** | Adjust the expiry constant in `kiosk-device.ts`, or the `kiosk.manage` row in the permission matrix. Making enrolment Admin-initiated instead is a different flow, not a constant — re-run **Phase 12**. |
| **Ask Arjun** | "When a new gate tablet is set up, it shows a code and an Admin types that code into the portal to approve it. If a tablet is lost, an Admin retires it from the portal and any punches it had saved up are still counted when it reconnects. Is that right — or should punches from a retired tablet be held for someone to look at first?" |

---

## D19 · What may a tablet pull, and how stale is too stale?

| | |
|---|---|
| **Question** | The tablet works offline from a list it pulled earlier. What exactly is in that list, whose shift does it show, and when does a tablet that has not been heard from turn amber and red? |
| **Status** | **ASSUMED by Phase 12 (2026-09-20)** |
| **Assumed value** | **The pull carries, per active employee, exactly four things: `id`, `name`, `badgeCode` (the employee code the printed badge encodes) and `shift`** — and nothing else. It is built from an explicit field list, never from a spread of the employee row, and a test asserts the exact key set and that no key resembles wage, salary, rate or pay. The roll is **factory-wide** (not narrowed by pool, D5): a gate scanner must resolve any badge. `shift` is the shift the employee is allocated to today, else the shift on today's attendance row, else `null` — a `null` means "use the shift on the clock now". K10 also lists "rules" on the tablet; **none are sent**, because a rules payload needs its own decision about which rules are safe to hold on a stealable device. **Staleness** is read from the device's last successful sync: **green ≤ 30 minutes, amber ≤ 8 hours, red beyond that or never**; the employee list itself is **green ≤ 24 h, amber ≤ 72 h, red beyond**. The thresholds are named constants in one pure module. |
| **Rationale** | Wages are Owner-only everywhere (S9, recorded as D24 — D6 is the AQL rule); the gate tablet is the place they must never reach, and an allow-list is the only shape that stays true when someone later adds a column to the employee table. Eight hours is one shift: a tablet silent for a whole shift is the 3 a.m. call K12 exists to prevent, while three hours offline with the queue intact (K12's own example) is amber, not an emergency. "2 days old" is amber in K12, which fixes the cache scale. |
| **Depends on it** | `src/server/mis/kiosk-device.ts` (`buildPullPayload`), `src/lib/mis/kiosk-health.ts`, the attendance home health card, the device list screen, Phase 13, Phase 19 QA (wage-leak sweep) |
| **To change** | Edit the constants in `kiosk-health.ts`; the payload's field list is one array in `kiosk-device.ts` and the leak test names it. Re-run **Phase 12** and **Phase 19**. |
| **Ask Arjun** | "How long can a gate tablet go without contacting the server before someone should be worried — half an hour, a few hours, a whole shift? And is it acceptable that the tablet holds every active employee's name and badge number, but no pay information of any kind?" |


## D20 · What is a punch, and how is an attendance day derived from punches?

| | |
|---|---|
| **Question** | A badge scan can arrive twice, out of order, hours late, or across midnight. What is stored, and how does the attendance day come out of it? And does ingestion also work out lateness and overtime? |
| **Status** | **ASSUMED by Phase 13 (2026-09-20)** — from `K2-Offline-sync-queue.png`, D15 and the phase's acceptance checks |
| **Assumed value** | **A punch is an immutable fact** (person, IN or OUT, the *device's* time per D15, which tablet, who confirmed it), kept in its own table. **A day is a pure function of a person's punches**, so the order they arrive in, duplicates, and lateness of arrival cannot change the answer. The day's clock-in is the earliest IN and its clock-out the latest OUT of that stretch of work; a second IN while already in is ignored; a lone OUT still shows the person as present. A stretch is at most **16 hours** from IN to OUT — a longer gap is a new day, so a forgotten clock-out never swallows the next morning. **A night shift belongs to the day it started**: a 00:10 clock-in for a 22:00 shift is the previous day's attendance. The tablet may name the person's shift and that is preferred over guessing from the clock, because windows overlap (05:50 for a 06:00 shift is inside the night shift that ends at 06:00). **A day a person has edited by hand is never overwritten by a punch**: the punch is still recorded, and the day is left as the person set it. **Ingestion does not compute lateness or overtime and never writes `lateMinutes` or `otMinutes`.** |
| **Rationale** | Attendance decides pay, so the record of who was at the gate cannot be something each arrival patches — a derived day cannot drift from its punches, and a correction only has to add a row. The guide called lateness and overtime "built"; nothing in the code computes them (they are only read), and a grace period or overtime threshold decides someone's pay, so this phase does not guess one. Sixteen hours is a 12-hour shift plus overtime. |
| **Depends on it** | `MisAttendancePunch`, `src/lib/mis/attendance-day.ts`, `src/server/mis/attendance.ts` (ingestion), the attendance-home cards, Phase 19 QA (MIS-247 assumes lateness rules that do not exist) |
| **To change** | The 16-hour span is `MAX_SHIFT_SPAN_HOURS` in `attendance-day.ts`. Computing lateness/OT at ingestion is new work needing its own rule keys — re-run **Phase 13** and **Phase 19**. |
| **Ask Arjun** | "How many minutes after the shift starts does someone count as late, and after how many hours does overtime start? Today the system records exactly when people punched, but does not itself decide who was late or how much overtime they did." |

---

## D21 · Corrections, the correction window, and unknown badges

| | |
|---|---|
| **Question** | K2 says a punch is never edited — Fix records a correction that supersedes it. What happens to a punch for a day that is already closed, for a badge nobody recognises, or for someone who has left? And who counts as a witness? |
| **Status** | **ASSUMED by Phase 13 (2026-09-20)** |
| **Assumed value** | **Punches are never edited or deleted** — the database refuses it. A correction is a *new* row that names the punch it replaces and why; both are kept. **A punch whose attendance day is older than the correction window is parked** as `CORRECTION_WINDOW_CLOSED` for the Super Attendance Operator, not applied and not dropped; the window is the existing `ATTENDANCE_CORRECTION_DAYS` rule. **A badge nobody recognises is parked** as `BADGE_UNKNOWN`, keeping the scan time and the code (K2: "a real event — a new joiner, a reissued card, a damaged QR"); **a punch for someone no longer active is parked** as `EMPLOYEE_INACTIVE`. None of the three can be released by a plain retry (D17) — each needs a person. The gate operator who confirmed the face (K1, K9) is **recorded when the tablet sends it and is not yet required**; requiring it belongs to the tablet app, which owns the operator PIN. **Which timezone a day is decided in is D22, not the server's** (this row originally assumed the server's local time; D22 supersedes that). |
| **Rationale** | "Attendance decides pay, so nothing here is ever overwritten in place" (K2). Silently applying a punch to a closed month would rewrite pay after the fact, and silently dropping an unknown badge loses a real person's day. The operator is optional for now because the PIN sign-in lives in an app that does not exist in this repository. The timezone was first flagged here as a risk; D22 resolved it. |
| **Depends on it** | `MisAttendancePunch` and its trigger, `src/server/mis/attendance.ts`, `ParkReason` in `src/lib/mis/offline/idempotency.ts`, Phase 19 QA, Phase 23 (the inbox builds the audited override and the correction) |
| **To change** | Move a reason into `RETRYABLE_PARK_REASONS` only by amending D17. The window is a setting (`ATTENDANCE_CORRECTION_DAYS`). Making the operator mandatory is a one-line check once the app sends it. |
| **Ask Arjun** | "If a gate tablet sends a punch for a day that is already closed for corrections, or a badge the system does not know, we hold it for the Super Attendance Operator to sort out rather than guessing. Is that right — and (Answered by D22: the factory's zone, never the server's.)" |

## D22 · What timezone is "a day"?

| | |
|---|---|
| **Question** | Phase 13 asked whether the server runs on factory time. What clock decides which day a punch belongs to? |
| **Status** | **DECIDED from evidence (2026-09-20)** — high confidence. Confirm the value with Arjun, not the mechanism. |
| **Decided value** | **Never trust server local time.** A single business rule `factory.timezone` holds an IANA zone, seeded `Asia/Kolkata`. Every day-boundary, shift-window and attendance-day derivation resolves through it. Instants stay `timestamptz` (UTC) in the database; only *bucketing into a day* uses the factory zone. |
| **Rationale** | The Supabase instance is in `ap-southeast-1` (UTC+8); the factory is in Medchal, IST (UTC+5:30) — 2.5 hours apart. A night shift ending 06:00 IST is 08:30 in the DB's zone, so any derivation using server local time silently attributes punches to the wrong day, and the error only appears in a payroll dispute weeks later. Hosting region can also change without notice; a rule cannot. |
| **Depends on it** | `src/lib/mis/attendance-day.ts`, `src/lib/mis/shift-window.ts`, punch ingestion, attendance register, payroll period boundaries, every daily report |
| **To change** | Edit the `factory.timezone` business rule. Effective-dated, so historical derivations keep the zone they were computed under. A second plant in another zone makes this per-department rather than global — note that before assuming one factory forever. |
| **Ask Arjun** | "Confirm the plant runs on IST and there is no second site in another timezone." |


## D23 · Who may say whose badge an unrecognised scan really was?

| | |
|---|---|
| **Question** | K2: an unrecognised badge "sits in the queue with its scan time and a Fix button, so it is resolved that morning while somebody still remembers who it was." Who is trusted to say who it was — and what exactly does Fix do to the record? |
| **Status** | **ASSUMED by Phase 13 (2026-09-20)** — from K2, which shows the button on the tablet queue with no approval step |
| **Assumed value** | **The operator at the tablet may choose the person.** Fix records a **new punch** for the chosen person, at the **original scan time** (D15), under a **new key**, and names the held entry it corrects. The held entry is then marked **resolved** — it is annotated, never edited or deleted — and only when the correction comes from **the same device (or the same signed-in user)** that made the held entry, and only for an **unrecognised badge**. Every other held punch (a closed day, a wrong clock, a leaver, a too-old scan) has **no Fix at the tablet**: it names who must decide and waits for a Super Attendance Operator or Admin. The correction is subject to every gate a normal punch is — the correction window and the clock tolerance still apply. |
| **Rationale** | K2's own words: the point of fixing at the gate is that "somebody still remembers who it was". Making the operator wait for an office approval would send the person to a paper register, which is the failure the design exists to prevent. The safeguards are that the operator's identity is on the punch (K9), that the original scan is kept and annotated rather than replaced, and that a badge that *did* match someone is never touched. The trade-off is real: an operator could name the wrong person or a friend. |
| **Depends on it** | `correctsKey` in `src/server/mis/attendance-punch.ts`, `src/components/mis/kiosk/punch-fix.ts`, the kiosk queue panel, Phase 23 (the inbox must show these as resolved and offers the override for everything else) |
| **To change** | Require a Super Attendance Operator by removing the Fix button and routing `BADGE_UNKNOWN` to the inbox like every other punch park (`canFix` in `punch-queue.ts`). Re-run **Phase 13**. |
| **Ask Arjun** | "If a gate operator scans a badge the system does not know, they can pick which worker it really was, and the punch is recorded at the original time with the operator's name on it. Is that acceptable — or should a Super Attendance Operator always confirm it?" |

---

## D24 · Who may see money?

| | |
|---|---|
| **Question** | Wages are Owner-only. Are material rates (BOM `ratePerUnit`), stock prices (`pricePerUnit`) and their totals Owner-only too — and does "may not see" mean the value is not sent, or only not drawn? |
| **Status** | **Wages: DECIDED — BRD S9**, in force since Phase 1 as `wages.read`. **Everything else: ASSUMED by Phase 14 (2026-09-21)** — inferred from the screens, which hide these behind `isOwner`. |
| **Assumed value** | **Money is Owner-only, and "Owner-only" means the server does not send it to anyone else.** `wages.read` is the one permission that carries it (there is no separate "costs" permission), which is how the BOM, approvals, reports and order screens already read it (`isOwner = can(role, 'wages.read')`). A column hidden by the screen but present in the page payload is a leak, not a rule. **Wages** additionally never appear in an audit `before`/`after` payload, including as a generic `ruleValue` for a wage rule. **AQL thresholds** are governed separately by **D6**. |
| **Rationale** | The screens already draw the line — the BOM rate, the store-value column and the approve buttons all sit behind `isOwner` — so the intent exists; only the server side of it was never written. Hiding a value in a component protects nothing: the browser has already downloaded it. The alternative (material rates visible to Supervisor, QC and Admin) would need its own permission and a reason; nobody has asked for either. The wage rule is recorded here only because it had no D-number: D19's rationale and the Phase 14 prompt both cited D6 for it, and D6 is the AQL rule. |
| **Depends on it** | `src/server/mis/{bom,reports,payroll,business-rules,audit}.ts`, `src/lib/mis/permissions.ts` (`wages.read`), the payroll, payslip, BOM, approvals, reports and settings screens, `docs/qa/FINDINGS.md` F-01…F-06, Phases 16, 19, 20, 21 |
| **Applied** | **Phase 24C/24D** implemented it as "the server omits the price": `getBom`, `getOrderTrace`, `getStoreReport`, `getPO`, `getGRN`, `listItems`/`getItem`/`searchItems` and every write function's return value drop `ratePerUnit`/`pricePerUnit` unless the caller holds `wages.read` (`lib/mis/money-fields.ts`); `computePoTotal` and `getBomCosting` are `wages.read`; the audit writer redacts both keys. **Not decided, so not enforced:** WRITING a price (F-15). |
| **To change** | To widen material rates to another role, add a `costs.read` action to `permissions.ts` and gate `getBom`, `getStoreReport` and the PO reads on it; the F-06 tests then flip to the new action. Wages never widen. |
| **Ask Arjun** | "Wages are visible to you alone. Should the price of materials — the rate on a bill of materials, the price of a stock item — also be yours alone, or may your Admin see them?" |

## D25 · Who may grant the Owner role?

| | |
|---|---|
| **Question** | `updateEmployee` and `createEmployee` accept a `role`, and `employees.write` is held by Admin. May an Admin therefore make someone an Owner — including themselves? And may an Admin edit or deactivate the Owner's own record? |
| **Status** | **ASSUMED by Phase 14 (2026-09-21)** — the first half from the code's own comment on `assignableRoles`; the second half is **open** and asserted by no test |
| **Assumed value** | **Only an Owner may create an Owner or promote anyone to Owner.** `assignableRoles('ADMIN')` already omits OWNER ("an Admin cannot mint an Owner — that is the whole point"); the rule is that the SERVER refuses it, not only the picker. Whether an Admin may edit, demote or deactivate the Owner's record is **not decided** here — today nothing stops it (F-10, F-11). |
| **Rationale** | The role a login holds is read from its employee row (`roles.ts`), so writing OWNER onto a row is granting `wages.read`, `aql.read` and `users.invite`. A rule that lives only in a dropdown is not a rule. The second half is left open on purpose: it is a real policy question (can an Admin lock the Owner out?) and inventing an answer inside a QA phase is how a product acquires rules nobody agreed to. |
| **Depends on it** | `src/server/mis/employee.ts`, `src/lib/mis/roles.ts` (`assignableRoles`), `src/server/mis/users.ts`, `docs/qa/FINDINGS.md` F-10, F-11 |
| **To change** | Allow an Admin to grant any role by removing the check the fix adds to `createEmployee`/`updateEmployee`; the F-10 tests are the only thing that says otherwise. |
| **Ask Arjun** | "Your Admin can add and edit people. Should the Admin be able to make a person an Owner — or change or switch off your own record — or is that yours alone?" |


## D26 · How is overtime paid?

| | |
|---|---|
| **Question** | The client demo said "different OT multipliers per employee". Multiplier of what — basic or gross? |
| **Status** | **DECIDED by Yash (2026-09-20)** — supersedes the "multiplier" wording from the meeting |
| **Decided value** | **OT is a per-hour rate stored on the wage code, not a multiplier.** The owner sets an OT rate per hour on each wage code (e.g. a daily hire at ₹500/day carries its own OT/hour). OT pay = OT hours clocked × that rate. Different OT treatment comes from putting people on different wage codes. Daily and monthly employees share the same wage-code fields; only the base differs. |
| **Rationale** | A multiplier needs a base, and "1.3× of what" is ambiguous and silently wrong at scale. An explicit per-hour rate is what the owner actually thinks in, needs no arithmetic convention, and is auditable on the payslip. |
| **Depends on it** | `MisWageType` (OT rate/hour field), payroll calculation, payslip OT row, employee wage-code assignment |
| **To change** | Add a multiplier field alongside the rate and choose per wage code. Do not replace the rate — historical payslips must keep resolving. |
| **Open** | Does a daily hire working a Sunday earn a premium? ASSUMED ordinary rate — confirm with Arjun. |

---

## D27 · Which rate pays an attendance day?

| | |
|---|---|
| **Question** | Rates (daily wage, overtime multiplier, late penalty) are effective-dated and never edited in place. When payroll prices a month, which row applies — the one in force now, the one at month end, or the one on each day — and is a computed month ever final? |
| **Status** | **ASSUMED by Phase 14F (2026-09-21)** — MIS-272 required "a closed month does not move" but never said how a rate change *inside* a month is treated |
| **Assumed value** | **Each attendance day is priced at the rate in force on that day's own date.** A rate effective from the 15th pays the 15th onward and leaves the 1st–14th on the old rate, so a mid-month change splits the month. A rate effective after a month never touches it. The wage-type master (`WG-DAILY-01`) applies from its own effective date; before it, the flat `DAILY_WAGE_DEFAULT` rule applies (MIS-44); before either, the documented fallbacks (500 a day, ×1.5, no penalty). A month's bounds are calendar dates in UTC, never server time (D22). **D26 (overtime becomes a per-hour rate on the wage code) will replace the multiplier when Phase 25 builds it; the rule here — price each day at the rate in force on that day — applies unchanged to whatever rate replaces it.** **A month is NOT yet final:** a *back-dated* rate does re-price the days it covers, because there is no period-close record to protect them — that needs a stored payroll snapshot (schema), and belongs with the payroll rework in Phase 25. |
| **Rationale** | "Effective-dated" means a rate starts on a date, so pricing a day at the rate of that day is the reading that needs no exception; "as of month end" would pay 1–14 January at a rate that only began on the 15th. Reading "as of now" is what F-08 was: adding a rate moved every closed month. Back-dating is left working on purpose — refusing it would need a close, and a silent refusal would be a second unagreed rule. |
| **Depends on it** | `src/server/mis/payroll.ts` (`calculateMonthlyPayroll`), `src/lib/mis/effective-dated.ts`, `getWageRateHistory` (`wage-type.ts`), `getWageRuleHistory` (`business-rules.ts`), `src/server/mis/rule-history.test.ts`, Phases 19 and 25 |
| **To change** | To price a month at one rate (say, the rate at month end) change the three `…On(date)` lookups in `calculateMonthlyPayroll` to resolve one date; the mid-month split test in `rule-history.test.ts` then flips. To lock a month, add a payroll-period snapshot table (schema gate) and read from it once closed. |
| **Ask Arjun** | "If the daily wage goes up on the 15th, should the 15th onward be paid at the new rate and the 1st to 14th at the old one? And once you have paid a month, should the system refuse any later change to that month's figures?" |


## D28 · Extra-pay days and the multiplier basis

| | |
|---|---|
| **Status** | **DECIDED by Yash (2026-09-20)** |
| **Extra-pay day** | A date can be marked extra-pay. Defaults to **everyone present that day**, and can then be narrowed to specific employees or departments. The extra is **either a multiplier or a flat amount, chosen per day**. |
| **Approval** | Admin and Super Attendance Operator can **propose** an extra-pay day; it affects payroll only once the **Owner approves**. Owner can create and approve in one step. Reuses the existing approval queue, never a second mechanism. Rationale: this is the one control that lets a non-owner raise the wage bill — Phase 14F just closed exactly this class of leak. |
| **Multiplier basis** | **Monthly/fixed employees** carry a monthly multiplier. **Daily employees** take theirs from the wage code, and the wage code declares whether its figure is applied **per month or per hour**. One field says which basis; the calculation never guesses. |
| **Depends on it** | `MisWageType` (basis + OT rate/hour), employee (pay type, monthly multiplier), new extra-pay-day model, payroll calculation, approval queue, payslip |
| **Interacts with** | D26 (OT is a per-hour rate on the wage code). An extra-pay day and OT can both apply to one day — test that combination explicitly; it is where the money goes wrong. |
| **Open** | Does a daily hire working a Sunday earn a premium, or the ordinary rate? ASSUMED ordinary — confirm with Arjun. |

---

## D29 · What does a role with no dashboard widgets see?

| | |
|---|---|
| **Question** | The desktop dashboard is a widget canvas, and every widget names the permission it needs (D2). A **STORE_GUY** holds `inventory/grn/po/store` and none of `production.read`, `orders.read`, `qc.read` or `attendance.read` — so the catalogue computes to nothing and their dashboard is empty. Is that right, and what should they see? |
| **Status** | **ASSUMED by Phase 24 (2026-09-21)** — the artboards do not draw a Store dashboard |
| **Assumed value** | **The catalogue stays honest and the dashboard shows the empty state** ("no widgets are available for your role yet"), rather than inventing a Store widget group. The four groups are the ones D2 draws — Production · Quality · People · Money — and a fifth would be new design, not a build decision. A Store Manager reaches their work through the sidebar (Stock, Receive, Issue), which is unchanged. |
| **Rationale** | Two worse options were available and both were refused: widening the store role's permissions so existing widgets light up would undo the principle Phase 14F spent a whole phase restoring, and inventing a Store group would put design in a code review. An empty state is the honest report of a real gap, and `08-Empty-error-offline.png` already has the pattern for it. |
| **Depends on it** | `src/lib/mis/widgets.ts` (the registry and its `requires`), `src/server/mis/dashboard.ts`, the dashboard route, `widgets.test.ts` |
| **To change** | Add the widgets to `WIDGETS` with `requires: 'store.read'` and a `STORE` group to `WIDGET_GROUPS`; `widgets.test.ts` pins the count and the group list, so both fail until updated deliberately. No data migration, no schema change. |
| **Ask Arjun** | "Your store manager has a desktop too. Should they get a dashboard of their own — stock low, goods in today, issues out — or is the stock screen enough?" |

## D30 · Who schedules a business-rule change, and is a reason required?

| | |
|---|---|
| **Question** | D12 draws an Owner-only "Business rules" screen where a change is a NEW row with a start day. But an Admin already holds `settings.write` and edits the general rules on the older `/mis/settings` list (`updateBusinessRule`, effective from now, no reason). Which of the two is the rule, who may use the new one, and must a change carry a reason? |
| **Status** | **ASSUMED by Phase 24E (2026-09-22)** — the artboard says "Owner only" and "a reason is required", and D4/D25 give the Owner what payroll pays and QC accepts |
| **Assumed value** | **Scheduling a change to ANY rule is the Owner's** (`wages.read` is the Owner marker, D24/D25): `scheduleBusinessRule` refuses the other seven roles and the page is absent (404) for them. **A reason of at least three characters is required**, the start day is the **factory's** (D22), it may not be in the past, and a second row on the same day is refused. **Every change writes a `SCHEDULE_RULE` audit row** carrying the day and the reason; a wage rule's audit row names the rule and never the figure (D24, F-04). **The older list stays as it was:** Admin keeps editing the general (non-wage, non-AQL) rules there — effective now, no reason — because removing it would change the phone screen. |
| **Rationale** | A rule change moves what payroll pays and what QC accepts; the reason is the first thing an auditor asks for. Giving the Admin the new screen would let a scheduled change bypass the Owner-only wage and AQL screens that D6 and D24 exist to protect (F-03). Leaving the old list alone is the smallest change that keeps every phone screen working. |
| **Depends on it** | `server/mis/business-rules.ts` (`scheduleBusinessRule`, `createRuleRevision`), `server/mis/rules-ledger.ts`, `lib/mis/rules-ledger.ts`, `/mis/settings/rules`, `business-rules-schedule.test.ts` |
| **To change** | Give another role the screen by changing the gate in `scheduleBusinessRule` and `getRulesLedger` (and the matrix rows). To require a reason on the older list too, pass one through `updateBusinessRule` → `createRuleRevision` — no schema change, the reason lives in the audit row's `after`. A reason COLUMN would be a schema change (SCHEMA GATE, Half A). |
| **Ask Arjun** | "When the Admin edits a general rule on the old settings list, should that also need a start day and a reason, or is that list only for things nobody would audit?" |

## D31 · What is a document's link allowed to be, and what does the library group by?

| | |
|---|---|
| **Question** | A `MisDocument` is a name plus a pasted link (`filePath`) to a file the MIS does not hold, attached to one order. The phone screen turns that string straight into an `href`, and D13's artboard groups documents as GENERATED (job cards, COAs…) and UPLOADED (POs, samples…) with versions, retention and a preview. What may a link be, and what can the library honestly group by? |
| **Status** | **ASSUMED by Phase 24E (2026-09-22)** — nothing in the artboard or the BRD says what a link may be |
| **Assumed value** | **A link is followed only if it is an absolute `http:`/`https:` URL or a path on this site** (`/…`, not `//…`). `javascript:`, `data:`, `file:` and everything else is stored as text and never becomes an `href` (a pasted `javascript:` link is a stored XSS on the next person to click Open). The desktop **add** refuses such a link on the server (`saveDocumentLink`), and the desktop list/detail never links one; **the phone screen and `addDocument` are unchanged**, so an old row with a bad link still reads as text on the desktop and as a link on the phone (F-23). **The library groups by recorded file type** (PDF · Images · Other · Type not recorded) and a factory-month filter — the only groupings the data supports. **D5 holds:** documents are tied to an order, not to a person, so they narrow only through `resolveVisibleOrderWhere` (today `{}`); the uploader's display name is shown as the phone list shows it. |
| **Rationale** | Two worse options were refused: inventing a Generated/Uploaded category and per-version rows the schema cannot store would put design in a code review, and a desktop screen that followed any pasted string would copy the phone's hole into a second screen. |
| **Depends on it** | `lib/mis/document-library.ts` (`safeHref`, `validateDocumentInput`, `mimeFamily`), `server/mis/document-library.ts`, `/mis/documents`, `document-library.test.ts`, `documents-desktop.test.tsx` |
| **To change** | To add categories, versions or retention, add columns to `MisDocument` (SCHEMA GATE, Half A — nothing here does). To allow another scheme (say `s3:`), extend `safeHref` and its test in one place. To harden the phone screen too, route its `href` and `addDocument` through the same helper — a change to a phone screen, so a PR line. |
| **Ask Arjun** | "Documents today are links to files kept elsewhere. Should the MIS store the files itself — and do you want job cards and COAs kept as versioned records, or is the print page enough?" |

## D32 · How does a phone reach a screen that is not one of its five tabs?

| | |
|---|---|
| **Question** | The phone bottom bar is five tabs, never six (a sixth does not fit a 360px thumb), and the R1, R2 and R4 artboards draw the same five for Owner, Supervisor and Admin. Store, GRN, PO, Inventory, Suppliers, Customers, BOM, Documents, Traceability, Audit and Payroll are on the desktop sidebar but under no phone tab for those three roles (F-27). What is the way to them on a phone? |
| **Status** | **ASSUMED by Phase 24G (2026-09-22)** — the artboards draw only the five tabs and say nothing about the rest |
| **Assumed value** | **Owner, Admin and Supervisor phones show "More" as the fifth tab, listing every screen the role may open; the tab it replaces (Owner: Settings, Admin: Reports, Supervisor: Me) moves into More.** Still five tabs, never six. More opens a bottom sheet of links (each row 44px), grouped Store & purchasing · People & attendance · Production & quality · Records · Admin. **The list is the desktop sidebar's permission table** (`navigationForRole` in `server/mis/navigation.ts`): a screen is listed if and only if the role holds the permission its page needs, so the phone cannot offer what the desktop would not (D3, D24 — Payroll and the business-rules screen are Owner-only). Five phone-only rows (Crew, Leave, Settings → Users, Settings → Business rules, Me) are in that table but not in the sidebar, each with the permission of the page it opens. **QC, both attendance operators, Store Manager and Worker keep their fixed tabs and get no More.** |
| **Rationale** | A Store card on each home would need a design for three roles and would still leave GRN, PO, Suppliers and the records screens unreachable. One list, derived from the table that already governs the sidebar, closes the gap for every screen at once and cannot drift. Keeping the other roles' bars unchanged leaves the screens the artboards do draw exactly as drawn. |
| **Depends on it** | `components/mis/home/bottom-nav.tsx` (`barForRole`), `components/mis/home/more-sheet.tsx`, `lib/mis/phone-more.ts` (which roles, and the grouping), `server/mis/navigation.ts` (`navigationForRole`, the `phoneOnly` rows), `(mis)/mis/layout.tsx`, `kit/slide-over.tsx` (`placement="bottom"`), `more-tab.test.tsx`, `navigation-more.test.ts` |
| **To change** | Give another role a More tab by adding it to `MORE_TAB_ROLES` in `lib/mis/phone-more.ts` (its fixed fifth tab then moves into the list). Move a screen between sections in `GROUP_OF` there. Offer a screen on the phone by adding a row to `NAV` (with the `requires` its page enforces; `phoneOnly: true` keeps it off the sidebar) and a `REQUIRES` row in `navigation-more.test.ts`. To use a Store card or a full "More" page instead, replace the sheet in `bottom-nav.tsx`; the list and its tests stay. No schema change. |
| **Ask Arjun** | "On the phone, Owner, Admin and Supervisor now get a fifth 'More' button that lists every screen they are allowed to open, and Settings, Reports or Me moves inside it. Is that how you want it, or would you rather have a Store shortcut on their home screen?" |

## D33 · Payroll rework (25.1–25.5) — schema-level choices the brief left open

| | |
|---|---|
| **Question** | The 25.1–25.5 brief and D26–D28 fix the money rules but leave several schema shapes unsaid: does a per-employee "which payslip rows print" toggle need its own history, is the employee→wage-code link a foreign key or a soft reference, is "Salary" (25.1's sixth row name) a value distinct from "Basic Wage", and how does an extra-pay day (D28) reuse "the existing approval queue" at the schema level? |
| **Status** | **ASSUMED by Phase 25 Half A (2026-09-22)** — schema decisions made while writing the migration, so Half B is not free to invent a different shape mid-build |
| **Assumed value** | **(1) Component toggles are NOT effective-dated.** `MisEmployeePayComponent` is one current row per (employee, component); a closed month's own figures are protected by the new `MisPayrollPeriod`/`MisPayrollSnapshotLine` snapshot, not by the toggle's own history — flipping a toggle today never has to prove what it was last month. **(2) The employee→wage-code link is a CODE (`MisEmployee.wageTypeCode`), not a foreign key** — consistent with every other reader of `MisWageType`, which already takes `code` and resolves the effective-dated row itself (`getWageRateHistory`); there is no single row a relation could point at. **(3) "Salary" is not stored data.** The BASIC component's row prints as "Basic Wage" for a DAILY employee and "Salary" for a MONTHLY one — a display label switched on `MisEmployee.payType`, not a second amount. **(4) Extra-pay days reuse the approval-queue PATTERN, not a shared table:** `MisExtraPayDay.status` (PENDING/APPROVED/REJECTED) is a plain status field exactly like `MisBom`/`MisPurchaseOrder`/`MisLeaveRequest`; `getPendingApprovals` (Half B) adds a fourth `findMany` alongside its existing three, never a generic "Approval" model. **(5) The multiplier basis (D28) lives on the WAGE CODE, not the employee** — a MONTHLY employee has only one figure to multiply (their salary), so the "per month or per hour" ambiguity D28 describes only exists for a DAILY employee, and only the wage code they're on needs to say which. |
| **Rationale** | Each of these is the reading that adds no field the brief didn't ask for. An effective-dated toggle would duplicate what the snapshot already protects. An FK to `MisWageType` cannot exist because the model has no single current row per code. A stored "Salary" amount would drift from "Basic Wage" the day someone edited one and not the other. A second approval mechanism is exactly what D28 says not to build. |
| **Depends on it** | `prisma/migrations-pending/20260926000000_mis_payroll_rework/migration.sql`, `MisEmployee` (`wageTypeCode`, `payType`, `sundayPaid`), `MisWageType` (`otRatePerHour`, `multiplierBasis`, `hraAmount`/`allowanceAmount`/`bonusAmount`), `MisEmployeePayComponent`, `MisExtraPayDay` + its two scope tables, `MisPayrollPeriod`, `MisPayrollSnapshotLine` — all built in Phase 25 Half A; every Half B reader/writer |
| **To change** | To effective-date component toggles after all, add `effectiveFrom` and drop the `@@unique([employeeId, component])` for a history-shaped one (Half B would then need `resolveAsOf` like every other rate). To make the wage-code link a real FK, `MisWageType` would need a stable per-code row (e.g. a `MisWageCode` parent the rate rows hang off) — a bigger schema change than this phase's scope. To store "Salary" as its own figure, add a column and stop deriving the label from `payType`. |
| **Ask Arjun** | Not a question for Arjun — these are implementation shapes inside decisions D26–D28 already made, recorded so a later session does not re-decide them differently. |

## D34 · PO approval chain (D2) — how OWNER_ONLY / ADMIN_ONLY / BOTH are actually chosen

| | |
|---|---|
| **Question** | D2 decided a PO's approval level does not depend on its purpose (FOR_ORDER vs BUFFER_STOCK) — "one threshold table for every PO." It did not say what the table actually looks like: how a PO ends up needing `OWNER_ONLY`, `ADMIN_ONLY` or `BOTH` (MIS-275's three named modes), or what "the threshold" is a threshold OF. |
| **Status** | **ASSUMED by Phase 21 (2026-09-26)** — no further guidance exists in `CHANGE_PO_WITHOUT_BOM.md` or MIS-275's own ticket text beyond naming the three modes and "a threshold" |
| **Assumed value** | **One effective-dated business rule, `PO_APPROVAL_THRESHOLD` (a rupee amount).** At `submitForApproval`, the PO's own total (`computePoTotal`'s arithmetic, read internally — never returned to a non-Owner caller) is compared against the threshold **in force that day** (D22/D27's own pattern: resolved as-of, never "as of now" later): **below the threshold → `ADMIN_ONLY`; at or above it → `BOTH`** (Admin approves first, then the Owner). The mode is **snapshotted onto the PO row** at that moment and never recomputed — a threshold changed after submission cannot move a PO already in flight, matching this phase's own acceptance check. **`OWNER_ONLY` is not chosen automatically.** It is an explicit, optional override the raiser (or an Owner) may set on the PO before submitting — for the one purchase that should skip Admin's step entirely regardless of its value. No second threshold, no purpose axis, no self-approval logic (an Admin approving their own raised PO) — none of those were asked for, and inventing them is exactly the rework this phase's brief warns against. |
| **Rationale** | Two real thresholds is a second decision nobody made; a self-approval rule is a third. One threshold, one automatic split (ADMIN_ONLY / BOTH), plus a manual escape hatch for the third named mode, is the smallest design that gives all three modes real meaning without guessing a business rule Arjun has not stated. Deciding the mode at submission and freezing it is the same pattern D27 already established for payroll rates — "as of the day it mattered," never re-derived. |
| **Depends on it** | `src/server/mis/po.ts` (`submitForApproval`, `approvePO`), `prisma/migrations-pending/20260927000000_mis_po_approval_chain/`, `MisPurchaseOrder.approvalMode`/`adminApprovedById`/`adminApprovedAt`, `src/server/mis/business-rules.ts` (`PO_APPROVAL_THRESHOLD` seed), `src/components/mis/approvals/approvals-screen.tsx` |
| **To change** | To add a second threshold (e.g. a higher one that forces `OWNER_ONLY` automatically), add a rule key and a second comparison in the same function — additive. To let an Admin approve their own PO be refused, add that check to `approvePO` — also additive, and worth doing regardless once Arjun confirms an approval chain matters to him at all. |
| **Ask Arjun** | "A purchase order above a rupee amount you set will need both your Admin and you to sign off; below it, your Admin alone is enough. What should that amount be — and should there also be a way to mark a specific PO as needing only you, regardless of its value?" |
