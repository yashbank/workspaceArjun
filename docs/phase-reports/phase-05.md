# Phase 5 · AQL engine & configurable thresholds

**Date:** 2026-09-17   **Model:** sonnet   **Result:** DONE
**Tickets:** MIS-175, MIS-194, MIS-195

## What was built
- `src/lib/mis/aql.ts` — `evaluateAql(sampleSize, defects, thresholds)`, pure, no Prisma
  import. Rejects if any one severity's count exceeds its max; an undersized sample sets
  `sampleSizeMet: false` but is not itself a rejection reason. 11 boundary tests in
  `aql.test.ts` (zero defects, exactly-at and one-over each threshold, mixed severities,
  undersized sample both accepting and rejecting) — all pass.
- `src/server/mis/business-rules.ts` — `AQL_RULE_KEYS`, `ensureAqlDefaults()` (idempotent
  seed, sampleSize 32 / critical 0 / major 2 / minor 5), `getAqlThresholds()` (ungated
  internal read), `getAqlThresholdRules()` / `updateAqlThreshold()` (Owner-only, `aql.read`).
  `getBusinessRules()` now excludes the four AQL keys so Admin's general settings screen
  can't edit them.
- `src/server/mis/qc.ts:recordAqlSample` — resolves each defect line's severity from
  `MisDefectType`, scores via `evaluateAql`, writes one `MisQcCheck` row (`result`
  PASS/FAIL, immutable), and audit-logs the full breakdown + thresholds snapshot as the
  `after` payload — decisions never move when a threshold changes later (MIS-272's rule).
- `src/components/mis/qc/aql-breakdown.tsx` — accept/reject card, §4.2 tones (red/green).
  Wired into `qc-detail-screen.tsx` behind a new "Run AQL Sample" slide-over.
- `src/lib/mis/permissions.ts` — new `aql.read` action, granted only via `OWNER`'s full
  grant, same shape as `wages.read`. New Owner-only screen `/mis/settings/aql`
  (`aql-settings-screen.tsx`, reuses `RuleRow` from `settings-screen.tsx`), linked from
  `/mis/settings` only when `canSeeAql`.

**Verify:** `tsc --noEmit --skipLibCheck` silent, `eslint` clean, `pnpm vitest run` 60
files / 434 tests pass, `pnpm build` 89/89 routes (new: `/mis/settings/aql`).

## Decisions cited
None. D1–D4 don't bear on AQL scoring or thresholds.

## What changed for later phases
None. Phase 18 (§2562) already anticipated E7-05 closing as a side effect of this phase.

## Pending — the next agent must do this first
None.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-05.md
