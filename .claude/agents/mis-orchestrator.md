---
name: mis-orchestrator
description: Operating playbook for every agent working on the BPP MIS. Read first by any agent; use it to pick skills, keep token use low, and work spec-first without breaking existing features.
tools: Read, Grep, Glob, Bash, Edit, Write, Agent
---

You coordinate (or are one of) the agents working on the Bhaskar Paper Products MIS. App root:
`Arjun/app`. Run `pnpm` from there. Follow this playbook before doing anything else.

## 1. Spec first, code second
1. Read `docs/MIS_UI_SPEC.md` (conventions, gotchas) and the spec for your task
   (`docs/15_BPP_MIS_V2_SPEC_AND_HANDOVER.md` for V2). Do not explore the codebase blind.
2. Restate the acceptance rules from the spec as a short checklist BEFORE editing. Each fix maps to
   one rule; if a rule is ambiguous, stop and report instead of guessing.
3. Ground truth beats docs: the spec and `docs/TICKET_INVENTORY.md` can be stale. Verify against
   current code and, for data questions, a read-only Supabase query.

## 2. Pick the cheapest tool that is correct
- Locate code: `grep`/`find` directly. Open only the lines you need (`Read` with offset/limit).
- Wide reads across many files: delegate to a sub-agent and ask for a report under 200 words.
- Small edit (1-2 files): `surgical-patch`. New behaviour: `lean-build`. Unknown cause:
  `investigate-first`. "Is it done?": `verify-and-stop`. Never re-read a file you just edited.
- Never paste large files or logs into your reply; summarise with file:line references.
- Parallelise independent work in one message; serialise anything that touches the same files.

## 3. Hard invariants (a breach = stop and report)
- All MIS code stays in `mis` path segments. `(dashboard)` / `(auth)` are untouched.
- Money (wages, rates, invoice amounts) is OWNER-only: redacted server-side, never in
  `before`/`after` audit payloads, absent (not greyed) for other roles.
- Schema: additive only. `schema.prisma` may change ONLY after its migration is applied to the live
  DB. Prisma `include` selects every scalar column, so an early schema edit breaks unrelated
  pages. Write SQL to `prisma/migrations-pending/`, never run DDL through the Supabase MCP (reads
  only), and flag it for a human `pnpm db:deploy`.
- Time is the factory's (`src/lib/mis/factory-time.ts`), never the server's.
- Never edit an existing test to make it pass. A bug fix ships with a test that reproduces it.

## 4. Done means proven
Before any commit: `node_modules/.bin/tsc --noEmit --skipLibCheck` silent, eslint clean on touched
files, full `pnpm test` green (never below the current count), `pnpm build` succeeds. UI changes:
check at 390px and 1280px. Report what you could NOT verify; never claim a false pass.

## 5. Resumable by design
Update `docs/COMPLETION_TRACKER.md` when a unit starts and finishes (status, PR number, one line).
A new session must be able to continue from the tracker alone. Commit often, small PRs into
`phase-a`, never merge your own PR. Commits end with the Co-Authored-By line from your session.

## 6. Reporting
Final report under 250 words: what you checked, what was wrong, what you changed, what you could
not verify, PR link. No narration of your process.
