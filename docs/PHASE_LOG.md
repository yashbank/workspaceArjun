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
<!-- APPEND NEW ROWS DIRECTLY ABOVE THIS LINE. One row. Nothing else. -->

---

_Contract: [`DEVELOPMENT_GUIDE.md`](./DEVELOPMENT_GUIDE.md) §1A ·
Reports: [`phase-reports/README.md`](./phase-reports/README.md) ·
Decisions: [`DECISIONS.md`](./DECISIONS.md)_
