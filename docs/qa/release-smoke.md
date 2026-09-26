# Release smoke checklist & rollback rehearsal (MIS-89, MIS-93)

_Phase 20. A checklist, not an executed rehearsal — no staging deploy or CI dashboard access was
available in this session. `docs/11-deployment-plan.md` is still mostly "to confirm" for hosting
and secrets; Session A's own roadmap (`HANDOVER.md`) names Phase 26 as the actual Vercel deploy,
so this checklist is written against what that phase will actually use, not the older generic
plan's placeholders._

## MIS-89 — prove the CI gates actually block

Run each of these on a throwaway branch and confirm the PR is blocked, then delete the branch:

1. **A failing test blocks merge.** Break one assertion in any `*.test.ts` file, push, open a PR.
   Expected: the check that runs `pnpm vitest run` goes red; the PR shows "checks failing".
2. **A type error blocks merge.** Introduce a type mismatch (e.g. pass a `string` where a
   function expects a `number`), push. Expected: `tsc --noEmit` (or the build step that runs it)
   goes red.
3. **A build failure blocks merge.** Reference an import that does not exist, push. Expected:
   `pnpm build` fails the check.
4. **The branch protection rule itself is on.** Confirm in GitHub → Settings → Branches that
   `develop` (and `main`) require the check(s) above to pass before merge is allowed at all —
   not just "shown", but required. This is the one item that cannot be inferred from a green
   check; it has to be read off the repo's own settings by someone with admin access.

None of the four above were run this session (no push access exercised for a throwaway branch
in this QA pass) — this is the exact list to run once, before the first real release, and again
whenever the CI workflow file changes.

## MIS-93 — rollback rehearsal + smoke checklist

**Rollback rehearsal (do this on a non-production environment first):**
1. Deploy a small, reversible change (e.g. a copy tweak) to staging/preview.
2. Confirm the previous deployment is still addressable (Vercel: every deployment gets its own
   URL and "Promote to Production" / "Instant Rollback" from the deployments list).
3. Roll back to the prior deployment. Confirm the app serves the OLD version again within the
   time the team would tolerate during a real incident.
4. **The one case that is NOT a one-click rollback: a schema migration.** This project's own
   `mis-schema-gate` skill and Phase Contract already treat every schema change as two
   deliberate halves for exactly this reason — a rollback of the CODE alone, after a migration
   that added a NOT NULL column or renamed something, can leave the database and the rolled-back
   code disagreeing. Confirm the last few migrations in `prisma/migrations/` are additive
   (new nullable columns/tables) rather than destructive, so a code-only rollback stays safe;
   flag any that are not for a human decision before the next release.

**Smoke checklist (run against the freshly deployed environment, every release):**
- [ ] `/login` loads and a known test account can sign in.
- [ ] `/mis` loads for at least one seeded account per role (or confirm `MIS_ENABLED_ACCOUNTS`
      includes a real test account for this environment).
- [ ] One write path per major module succeeds and is visible immediately after: create an
      employee, log a production entry, receive a delivery, approve a leave request.
- [ ] The Owner's payroll page and a payslip open with no console error (this is the one screen
      that changes shape the most often — Phase 25 rebuilt it entirely).
- [ ] No `Something went wrong` (uncaught exception) on any of the above.
- [ ] The database connection pool is healthy — the app does not immediately show
      "timeout exceeded when trying to connect" on a whole-list page (§2A.13's own failure mode).

## What this does NOT cover
An actual executed rehearsal against a real staging environment — this is the checklist to run
once one exists (Phase 26). Nothing here was run against a live deployment this session.
