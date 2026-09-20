# Phase 4 · Defect type master with AQL severity

**Date:** 2026-09-17   **Model:** haiku   **Result:** DONE
**Tickets:** MIS-19 (data), MIS-69 (BE), MIS-70 (FE)

## What was built

**Half A (schema, previous session):** `MisDefectSeverity` enum (CRITICAL/MAJOR/MINOR) and `MisDefectType` model (code, name, nameHi, severity, isActive, sortOrder, deletedAt).

**Half B (server + screen):**
- `src/server/mis/defect-type.ts` — listDefectTypes, getDefectType, create/update/delete/restore functions; all guarded by `masters.read`/`masters.write` and logged via `logAuditEvent`.
- `src/app/(mis)/mis/masters/defect-types/page.tsx` + `actions.ts` — thin server action layer wrapping server functions, `revalidatePath` on mutation.
- `src/components/mis/masters/defect-type-screen.tsx` — uses `<MasterTable/>` with columns (code, name, nameHi, severity status) and fields (code text, name text, nameHi text, severity select, sortOrder number).

Matches `department.ts` / `department-screen.tsx` pattern exactly. Severity is a select enum, not free text.

**Verify:** `tsc --noEmit --skipLibCheck` silent, `eslint` clean, `pnpm vitest run` (59 files / 423 tests pass), `pnpm build` (88/88 routes, including `/mis/masters/defect-types`).

## Decisions cited
None. No decisions changed.

## What changed for later phases
None identified.

## Pending — the next agent must do this first
None. Phase 5 (AQL engine) can now reference `MisDefectType` and its severity to compute accept/reject thresholds.

## Files to attach to the next phase
- Arjun/app/docs/DEVELOPMENT_GUIDE.md
- Arjun/app/docs/MIS_UI_SPEC.md
- Arjun/app/docs/DECISIONS.md
- Arjun/app/docs/PHASE_LOG.md
- Arjun/app/docs/phase-reports/phase-04.md
