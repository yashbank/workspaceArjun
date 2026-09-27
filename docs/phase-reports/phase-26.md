# Phase 26 · Vercel deploy verification (MIS-89, MIS-93)

**Date:** 2026-09-27   **Model:** sonnet   **Result:** PARTIAL — the deployment itself verifies
clean; MIS-89 (CI gates) does not exist yet and is a real decision, not a verification finding
**Tickets:** MIS-89, MIS-93 (per `docs/qa/release-smoke.md`, written by Phase 20)

## First task
Read §1A, `HANDOVER.md`'s one line on this phase ("Yash merges `develop` → `main`, then A runs
Phase 26 (Vercel deploy)"), the `PHASE_LOG.md` tail, `phase-reports/phase-23.md`, and
`docs/qa/release-smoke.md` (Phase 20's own pre-written checklist for exactly this phase). No
DEVELOPMENT_GUIDE.md section exists for "Phase 26" — it is only ever named in `HANDOVER.md`, so
this report follows the release-smoke checklist as the phase's own spec.

**Vercel was already fully set up** before this phase — auto-deploy on push, every production
env var (DB, Supabase, storage, mail) configured, for ~130 days. This phase is the verification
pass the checklist calls for, now that `main` actually carries the MIS module (through Phase 23)
for the first time — not a from-scratch setup.

## What was verified (read-only; no application code touched)

- **The live deployment.** `main` → `develop` → `main` (PRs #13–#16) triggered a fresh Vercel
  production build automatically; `vercel ls` confirms it `Ready`. `curl` against
  `workspace-arjun.vercel.app`: `/login` → 200; `/`, `/mis`, `/mis/queue`, `/mis/payroll` → 307
  to `/login?next=...` (the correct, intended behaviour for an unauthenticated request — proxy
  guard working, not a bug). The favicon/`icon.svg` now resolve (200) — this is what was missing
  when Arjun checked the site earlier in this session; it was never a Vercel problem, `main` was
  simply months behind `phase-a` until this session's PRs merged.
- **Env vars.** `vercel env ls production` confirms `RUNTIME_DATABASE_URL`, `DIRECT_URL`,
  `DATABASE_URL`, the Supabase keys, storage config and `ALLOW_BOOTSTRAP` are all set for
  Production and Preview. Values were not decrypted (not asked for, not needed for this check).
- **MIS-93's rollback safety.** The six most recent migrations (`20260921`–`20260927`) were read
  for destructive changes: every `NOT NULL` in them belongs to a brand-new `CREATE TABLE`, never
  an `ALTER TABLE ... ADD COLUMN` on an existing one — a code-only rollback stays safe (old code
  simply never queries the new tables). No `DROP` or destructive `RENAME` found. Vercel itself
  keeps every past deployment individually addressable (`vercel ls` lists the full history) —
  the "previous deployment still reachable" half of a rollback rehearsal holds without needing
  to actually trigger one against a currently-healthy production site.
- **MIS-93's smoke checklist (unauthenticated half only).** Routing, redirects and static assets
  all check out clean (above). The *authenticated* half (create an employee, log production,
  receive a delivery, approve a leave, open payroll/a payslip with no console error) needs a
  real signed-in session against production data — genuinely not something this session can do
  without a live test account; left for a human pass, same limitation Phase 20 already disclosed
  for MIS-84/89/93.

## What was found — MIS-89, and it does not verify clean

**The CI gate does not exist in the deployed repository.** `app/.gitignore` ignores the whole
`.github/` directory. Confirmed via the GitHub API rather than assumed: `actions/runs` on this
repo returns `total_count: 0` — not "checks are green," genuinely zero workflow runs, ever.
`gh workflow list` registers nothing. Neither `main` nor `develop` has branch protection (`GET
.../branches/{branch}/protection` → 404 "Branch not protected" for both). Every PR merged so far
(through #16, including this session's own) went in with no automated check of any kind running
against it. A complete, well-built workflow (lint/typecheck/test/build/migrate-diff, ticket
MIS-26) exists — on a local branch, `mis/MIS-26-ci-gates`, that was never pushed to `origin`; a
second, simpler `ci.yml` sits untracked in the current working tree (same gitignore rule hides
it from `git status`, which is why it was invisible until directly inspected).

This is recorded as **new F-35** rather than silently fixed: adopting it means choosing between
two different existing workflow definitions, deciding whether `develop` gets protection as well
as `main`, and deciding which checks are required (the MIS-26 branch's version adds `build` and
a `migrate-diff` job the untracked one lacks) — a real decision for Arjun/Yash, not something to
pick unilaterally during a deploy-verification pass.

## Decisions cited
None. Nothing here needed a D-number — this phase is verification and a factual finding, not a
design choice.

## Also found, not fixed
**F-28** (`error.tsx` writes 6 `MisForbiddenError` console errors per refusal — cosmetic, was
already tagged "Phase 26" in `FINDINGS.md` before this session, likely as a general "later"
bucket rather than this phase's actual scope). Left open — a small code change, not a deploy
verification, and this phase's own scope (`docs/qa/release-smoke.md`) never named it.

## Verification, honestly
No `tsc`/`vitest`/`build` run — no application code was touched this phase, only
`docs/qa/FINDINGS.md` and this report. All checks above were run directly against the live
Vercel deployment and the GitHub API.

## What changed for later phases
**F-35 blocks nothing technically** (the app deploys and runs fine without CI), but it means
every future PR is currently un-gated. Whoever picks up F-35 should read `mis/MIS-26-ci-gates`'s
diff first — most of the work already exists, unpushed.

## Pending
F-35 (a decision, then a build pass — see above). MIS-93's authenticated smoke half (needs a
human with a real production login). F-28 (cosmetic, unscheduled).

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-26.md
- Arjun/app/docs/qa/FINDINGS.md
- Arjun/app/docs/qa/release-smoke.md
