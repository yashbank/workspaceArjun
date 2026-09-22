# PHASE_LOG.md — the one-line-per-phase index

_Created 2026-09-15. Append-only. One row per completed phase, nothing else._

**What this is.** The first thing every phase agent reads, and the last thing it writes.
It exists so the next agent can learn the state of the project in one screen instead of
opening twenty-two reports. The detail lives in
[`phase-reports/phase-NN.md`](./phase-reports/); this file is only the index that points
at them.

**How to use it.**

- **Reading (first task of every phase).** Read the **tail** of the table — the last two or
  three rows. Anything in the **Pending for next phase** column of the most recent row is
  work you inherit; do it before your own tickets.
- **Writing (last task of every phase).** Append **exactly one** row. Do not edit an
  existing row, do not reformat the table, do not add columns. If a phase ran in two
  halves (a SCHEMA GATE), it still gets one row, appended after Half B.
- **Never** paste a summary, a finding, a code snippet or a decision into this file. Those
  go in the phase report. A row that needs a paragraph is a row that is in the wrong file.

**Column meanings.**

| Column | What goes in it |
|---|---|
| Phase | `0`–`21`. |
| Date | `YYYY-MM-DD`, the day the phase finished. |
| Model | The model actually used, e.g. `sonnet` / `haiku` / `opus`. |
| Result | `DONE` · `PARTIAL` · `BLOCKED`. Nothing else. |
| Tickets | The MIS- keys closed by this phase, comma separated. `—` for Phase 0. |
| Report | `phase-reports/phase-NN.md`. Always that exact path. |
| Later phases stamped | Phase numbers whose sections this phase **edited**, or `none`. |
| Pending for next phase | One short clause, or `none`. This is the handover. |

---

## Index

| Phase | Date | Model | Result | Tickets | Report | Later phases stamped | Pending for next phase |
|---|---|---|---|---|---|---|---|
| 0 | 2026-09-15 | haiku | DONE | — | phase-reports/phase-00.md | none | none |
| 1 | 2026-09-16 | sonnet | DONE | MIS-9, MIS-44, MIS-45 | phase-reports/phase-01.md | none | human runs vitest + pnpm build before Phase 2 |
| 2 | 2026-09-16 | opus | DONE | MIS-10, MIS-47, MIS-48 | phase-reports/phase-02.md | 3, 8, 14, §2 | Phase 3 must add manager assignment or the resolver stays dormant; send Arjun D5 |
| 3 | 2026-09-16 | sonnet | DONE | MIS-11, MIS-50, MIS-51 | phase-reports/phase-03.md | 3, 14 | none |
| 4 | 2026-09-17 | haiku | DONE | MIS-19, MIS-69, MIS-70 | phase-reports/phase-04.md | none | none |
| 5 | 2026-09-17 | sonnet | DONE | MIS-175, MIS-194, MIS-195 | phase-reports/phase-05.md | none | none |
| 6 | 2026-09-19 | sonnet | PARTIAL | MIS-137, MIS-148, MIS-149 | phase-reports/phase-06.md | none | D7 changed to a mode (JOB/SHIFT/MINUTES) + optional cap; human runs both pending migrations (`20260918000000_mis_line_clearance`, `20260919000000_mis_line_clearance_mode`) then `pnpm db:deploy && pnpm db:generate` before Phase 6 Half B STEP 2 |
| 6 | 2026-09-19 | sonnet | DONE | MIS-137, MIS-148, MIS-149 | phase-reports/phase-06.md | 11 | none |
| 7 | 2026-09-19 | opus | DONE | MIS-142, MIS-163, MIS-164, MIS-136, MIS-145, MIS-146 | phase-reports/phase-07.md | 11, 17, §A | none — planPhases/ensureBprProcesses are built and gated but have no screen; a planning UI must call them, not insert rows |
| 8 | 2026-09-19 | sonnet | DONE | MIS-260, MIS-262, MIS-263 | phase-reports/phase-08.md | 9 | none |
| 9 | 2026-09-19 | sonnet | DONE | MIS-261, MIS-265 | phase-reports/phase-09.md | none | machine-board-screen.tsx has no order/phase picker — unclaimed by any phase, jobRef stays writable until one adds it |
| 10 | 2026-09-19 | opus | DONE | MIS-25, MIS-85, MIS-86 | phase-reports/phase-10.md | 11, §A, §4, new Phase 22 | service worker (E8-03's remainder) unbuilt and Phase 11 needs it; Phase 22 has no Jira ticket yet |
| 11 | 2026-09-20 | sonnet | DONE | MIS-139, MIS-154, MIS-155 | phase-reports/phase-11.md | §A.8, 12, 13, 17, 22 | service worker unverified in a real browser (human airplane-mode check); Phase 22 numbering collision + no Jira ticket; Phase 13 registers punch senders and adds no sw.js routes |
| 12 | 2026-09-20 | sonnet | DONE | MIS-225, MIS-243, MIS-244 | phase-reports/phase-12.md | 12, 13, 19, §A cleanup of 22/23/24 refs | pair a real tablet + probe `/api/mis/**` signed-out (untested on device); Phase 13 adds its punch route by exact path to `kiosk-routes.ts` and uses `allowRevoked` |
| 13 | 2026-09-20 | sonnet | DONE | MIS-224, MIS-240, MIS-241 | phase-reports/phase-13.md | 13, 19, 20, 23, §3 spec | confirm IST with Arjun (D22) and airplane-mode a real tablet; Phase 20 timezone sweep (~20 server-local bucketing sites); Phase 23 builds punch overrides + the correction function |

| 14 | 2026-09-21 | sonnet | DONE | MIS-34, MIS-40, MIS-43, MIS-46, MIS-49, MIS-52, MIS-272 | phase-reports/phase-14.md | 14, 15, 16, 17, 18, 19, 20, 21, 23, 24, §6 | 5 HIGH bugs open (F-01 payroll behind attendance.read, F-02/F-03 wage+AQL rules via Admin, F-08 MIS-272, F-10 Admin→Owner) — fix pass before UAT; ask Arjun D24/D25; human runs qa/access-walkthrough.md; 49 it.fails to delete as fixes land |
| 14F | 2026-09-21 | sonnet | DONE | F-10, F-01, F-02, F-03, F-08 (+F-04); MIS-43, MIS-46, MIS-272 | phase-reports/phase-14F.md | 14, 14F, 19, 20, 25, §3 spec, D26/D27 | "closed month is final" needs a payroll snapshot (schema, Phase 25); old audit rows may hold wage values — human decides on a scrub; open: F-05, F-06, F-09, F-11, F-13; put D24/D25/D27 to Arjun |
| 24 | 2026-09-21 | opus | PARTIAL — SCHEMA GATE | Phase 24 (24.1, 24.2; no Jira ticket) | phase-reports/phase-24.md | 24, 25, §2.3, §3 spec, D29 | RUN THE GATE: mv prisma/migrations-pending/20260921000000_mis_dashboard_widgets → prisma/migrations/ then pnpm db:deploy && pnpm db:generate. Then Half B: layout persistence + Customise mode; 24.3 owner dashboard; 24.4 the eleven D screens (several sessions). Nothing seen in a browser yet; ask Arjun D29 |
| 24B | 2026-09-22 | opus | PARTIAL | Phase 24 part B (persistence, Customise, 24.3; no Jira ticket) | phase-reports/phase-24.md | 24, §3 spec, D29 | 24.4's eleven D screens are the next session (several sessions, not one). Drag-and-drop untested — keyboard path is what the suite drives. Nothing seen in a browser at any width. 3 files touched outside /mis for the flag-gated "Open MIS" sidebar entry. Ask Arjun D29 |
| 24C | 2026-09-22 | sonnet | PARTIAL | Phase 24 part C (D4, D5, D6; no Jira ticket) | phase-reports/phase-24.md | 24, §3 spec, F-06 | 24.4 has eight screens left (D7–D14). BOM costing is Owner-only at `getBomCosting` (7 roles refused); F-06 BOM half fixed, `getStoreReport`/PO rates/BOM audit still open; new F-14 (no downtime record, no back-in-service). Nothing seen in a browser. Ask Arjun: BOM versions? downtime? |
| 24D | 2026-09-22 | sonnet | PARTIAL | Phase 24 part D (F-06 closed; D7, D8, D9, D14; no Jira ticket) | phase-reports/phase-24.md | 24, §3 spec, D6, D22, D24, F-06 | 24.4 has four screens left (D10–D13); 3 dashboard widgets can now be wired. F-06 CLOSED (helper `money-fields.ts`); new F-15 (writing a price is ungated — ask Arjun), F-16–F-19 (honest gaps: wastage allowance, weekly off, machine on a QC check, unit + disposition on a defect). Nothing seen in a browser. |
| 24E | 2026-09-22 | sonnet | PARTIAL | Phase 24 part E (D10 master data, D11 traceability, D12 business rules, D13 documents; no Jira ticket) | phase-reports/phase-24.md | 24, §3 spec, D4, D5, D22, D24, D25, F-06 | **24.4 complete — all of D4–D14 built.** All four passed FE+BE checks; vitest 163 files / 3740 passed + 10 expected-fail; build passes. New F-20–F-23 (honest gaps: no Hindi name on machines/items; D11 has no lot→issue link or despatch; rules are not read as-of by most screens; documents are name+link only, and the phone screen still follows any pasted `javascript:` link) and D30 (Owner schedules rule changes, reason required) and D31 (link safety, group by file type). F-15 NOT decided. Fixed a select-resets-after-failed-save bug in D10 and D13. Nothing seen in a browser. |
| 24F | 2026-09-22 | sonnet | DONE | Phase 24F browser walkthrough & fix (no Jira ticket) | phase-reports/phase-24F.md | 24F, §2A.5, D22, D24, F-24–F-28 | Store, Inventory and GRN now open (one query per item on a one-connection pool; a Decimal reaching a client component; GRN list refused for a Supervisor). All 65 `/mis` routes × 8 roles × 390/1440 px walked in a real browser before and after (`qa/WALKTHROUGH-24F.md`): no crash, console error or wide page left. tsc silent; vitest 172 files / 3868 passed + 10 expected-fail; build passes. New F-24–F-28; no new D. Open: F-27 (a phone cannot reach Store/GRN/PO for Owner/Admin/Supervisor — design gap), tap targets <44 px, payslip id guard. Phase 25 stamped; §2A.13 added. Temp logins deleted. |
| 24G | 2026-09-22 | sonnet | DONE | Phase 24G UI polish (no Jira ticket) | phase-reports/phase-24G.md | D1, D3, D24, D32, F-25, F-27, F-29–F-33 | Every `/mis` screen walked as every role at 390/768/1024/1440 px (`qa/UI-GAPS-24G.md`, 63 gaps, most fixed): tap targets raised to ≥44 px kit-wide, invisible headings, a stale status enum killing badges/counts, a desktop-sidebar scroll bug and a masters-index server→client function-prop crash all fixed. F-27 closed via D32 (phone "More" tab, Owner/Admin/Supervisor, sourced from the same permission table as the desktop sidebar). F-25 closed (payslip id guard; `wage-screens.test.tsx` fixture became a UUID, disclosed). tsc silent; vitest 184 files / 3984 passed + 10 expected-fail; build passes. New F-29–F-33 (structural design mismatches — notification inbox, production two-tap flow, machine timeline, approvals queue, payroll screen — need a product call, not a layout fix); no schema change. Temp logins deleted. |
<!-- APPEND NEW ROWS DIRECTLY ABOVE THIS LINE. One row. Nothing else. -->

---

_Contract: [`DEVELOPMENT_GUIDE.md`](./DEVELOPMENT_GUIDE.md) §1A ·
Reports: [`phase-reports/README.md`](./phase-reports/README.md) ·
Decisions: [`DECISIONS.md`](./DECISIONS.md)_
