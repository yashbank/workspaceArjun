# phase-reports/ — one file per phase, named for the phase

_Created 2026-09-15._

## The naming convention — there is only one

```
phase-reports/phase-NN.md
```

`NN` is the phase number from `DEVELOPMENT_GUIDE.md` §4, **zero-padded to two digits**:

```
phase-00.md   phase-01.md   phase-02.md   …   phase-09.md   phase-10.md   …   phase-21.md
```

That is the whole convention. **Do not invent a filename.** Not `phase-2-visibility.md`,
not `PHASE_02_REPORT.md`, not `phase-02-2026-09-20.md`, not a dated folder. The next
agent is told to open `phase-reports/phase-NN.md` and nothing else, so a creative name is
the same as no report at all.

**Two halves, one file.** A SCHEMA GATE phase runs as Half A and Half B in two sessions.
It still produces **one** file. Half A creates `phase-NN.md` and marks itself
`Half A complete — awaiting migrate`; Half B opens the same file and completes it. Never
`phase-01a.md`.

**Re-running a phase.** If a phase is reopened, **append** a dated section to its existing
file under a `## Re-run YYYY-MM-DD` heading. Do not create a second file and do not delete
the original — the reason it was reopened is the most useful thing in the folder.

## What goes in the file

A phase report is written for the *next agent*, not for the human — the human already got
the ≤150-word summary. Use these headings, in this order, and keep it short:

```markdown
# Phase NN · <phase name>

**Date:** YYYY-MM-DD   **Model:** <model>   **Result:** DONE | PARTIAL | BLOCKED
**Tickets:** MIS-xx, MIS-yy

## What was built
Bullets. Cite `path:line`, never paste code.

## Decisions cited
Which of D1–D4 this phase relied on, and where. If you needed a value that is not in
DECISIONS.md, say so loudly — that is a new decision and it belongs in that file.

## What changed for later phases
Every later phase section you edited, with the `⚠ UPDATED BY PHASE N` stamp you left and
one line on why. `none` is a perfectly good answer.

## Pending — the next agent must do this first
The handover. Must match the last column of your PHASE_LOG.md row.

## Files to attach to the next phase
The exact list. This is what the human copies.
```

## Rules

1. **Cite paths, never paste contents.** `src/server/mis/visibility.ts:42`, not forty
   lines of TypeScript. The next agent can open the file.
2. **Under 400 words.** A long report is a report nobody reads, which costs the project
   the money this whole structure exists to save.
3. **Write it even when the phase failed.** A BLOCKED phase's report is the most valuable
   one in the folder — it tells the next session exactly what wall to avoid.
4. **The report is written before the PHASE_LOG.md row**, and the row's
   *Pending for next phase* cell must be the same clause as the report's Pending section.
   If they disagree, the next agent follows the report.

---

_Contract: [`../DEVELOPMENT_GUIDE.md`](../DEVELOPMENT_GUIDE.md) §1A ·
Index: [`../PHASE_LOG.md`](../PHASE_LOG.md)_
