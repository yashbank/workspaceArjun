---
name: mis-fast-phase
description: Run a Bhaskar MIS phase (or the FE/BE half of one) in a single pass to cut token usage and wall-clock time — do the work directly instead of spawning parallel build/check subagents, batch every related file into one edit sequence, and run tsc/vitest incrementally but pnpm build only once at the end. Use for a phase or half-phase that one session can hold in its head (roughly: touches under ~15 files, one screen area or one server domain) — not for a sweep that must cover every screen or role (that still wants the parallel walk/build-agent pattern from Phase 24G).
---

# mis-fast-phase

Spawning 2–4 parallel build/check subagents for every phase is the expensive path: each
one re-reads the guide, the spec and the surrounding code from cold, and that re-derivation
is most of the token cost — not the actual edit. For a phase small enough to hold in one
session's head, do it directly. Reserve the parallel-agent pattern (Phase 24G's four-part
UI sweep) for work that genuinely must fan out across many independent screens/roles at
once and would not fit in one context.

## Before starting

Read once, the normal Phase Contract first task (§1A): this phase's guide section, the
`PHASE_LOG.md` tail, the previous phase's report, `DECISIONS.md` entries you'll cite. Skim
only the files you will actually edit — do not re-explore the whole module tree "to be
safe". If a build/check subagent already scoped this work in an earlier turn (its file
list, its exact function signatures), reuse that plan instead of rediscovering it.

## The batch

1. **List every file the phase touches, up front**, in one short plan (schema, server
   functions, tests, pages, components). Write it down before editing — this is the "spec"
   that keeps the pass from wandering.
2. **Edit in dependency order** (pure helpers → server functions → tests for those → pages
   /screens → tests for those), but as ONE continuous pass, not one file per subagent
   round-trip.
3. **Write the test alongside the code it tests**, in the same edit round, not as an
   afterthought pass. A fix with no test that fails without it is not done (Phase Contract
   §1A still applies).
4. **Run `tsc --noEmit --skipLibCheck` after each logical unit** (it's fast, local, cheap —
   there is no reason to batch it up). Run the SPECIFIC test file you just touched
   immediately after writing it, not the whole suite.
5. **Run the full `pnpm vitest run` once**, after the whole batch is internally consistent
   — this is the point where cross-file regressions surface (a shared fixture, a shared
   permission-matrix row). Fix what it finds, re-run only the affected files, not the whole
   suite again unless the fix was itself cross-cutting.
6. **Run `pnpm build` exactly once, at the very end**, after vitest is fully green. It is
   the slowest step and the one most likely to be redundant mid-batch — Next's build catches
   server/client boundary and route errors tsc cannot, but only needs to run after the batch
   is otherwise believed correct, not after every file.
7. Commit once. Write the phase report and PHASE_LOG row as usual (Phase Contract §1A/B is
   unchanged by any of the above — only the MECHANISM of getting there changed, not the
   record-keeping).

## When to still use the parallel pattern instead

- A walkthrough/sweep that must visit every screen × every role × multiple widths (24F/24G
  shape) — that genuinely doesn't fit one context and benefits from independent parts.
- Work explicitly split by the user into named parallel tracks (e.g. the phase-a/phase-b
  session split in `docs/HANDOVER.md`).
- A single file or module large enough that one focused subagent with a narrow, fully
  -specified brief is cheaper than the lead holding the whole surrounding context in view.

## Rate-limit hygiene

- Prefer zero or one subagent over two-plus running concurrently — concurrent Sonnet calls
  spend the shared weekly budget fastest. If a subagent is genuinely warranted, run it
  alone and wait, rather than fanning out several at once.
- Don't re-read files already read this session "to be sure" — the harness keeps them in
  context; a stale-on-disk warning will say so if something changed underneath you.
- Batch verification (point 4–6 above) over re-running the same command after every small
  edit.
