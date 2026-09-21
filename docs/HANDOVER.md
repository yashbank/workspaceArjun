# Handover — running the MIS build from a second Claude account

## Who does what (never overlap)
| Session | Account | Branch | Phases | Database changes |
|---|---|---|---|---|
| A | original | `phase-a` | 24F → 25 → 19 → 20 → 21 → 23 → 26 | **Only A** (SCHEMA GATE, migrations) |
| B | second | `phase-b` | 15 → 16 → 17 → 18 → 22 (non-schema parts) | **Never.** Needs a schema change? Log it in FINDINGS as `NEEDS-SCHEMA → A`, skip it, and move on |

B does not edit store/inventory/GRN/PO files (A owns them in 24F/20/21) or payroll/attendance files (A owns them in 25/19). If a B fix must touch one, log it as `→ A` instead.

## Setup (B, once)
1. Accept the GitHub collaborator invite, then run `git clone <repo> && cd app && git checkout develop && git checkout -b phase-b`
2. Put the `.env` you were given into `app/.env` (never commit it)
3. `pnpm install && pnpm db:generate`. Do **not** run `db:deploy` or `db:migrate`
4. Check: `node_modules/.bin/tsc --noEmit --skipLibCheck && pnpm vitest run && pnpm build`
5. Open Claude Code in `app/`. The agents and skills load from `app/.claude/`

## Read before any phase
`docs/DEVELOPMENT_GUIDE.md` (§1A Phase Contract, §2A Known errors, your phase section), `docs/MIS_UI_SPEC.md`, `docs/DECISIONS.md` (D1–D31), `docs/PHASE_LOG.md` (tail), the latest `docs/phase-reports/`, `docs/qa/FINDINGS.md`. Designs: `design/screens/` + `_MAPPING.md`.

## Rules
- Use the build/check agent pairs (mis-fe/be-build, mis-fe/be-check). A PASS must cite file:line and exact test counts
- Wages and prices are Owner-only (D24). Never write them into audit before/after or into any field a non-Owner can read
- Use the Supabase MCP read-only. All schema changes go through Prisma, and only by A
- Number collisions: B takes F-numbers from **F-100** and D-numbers from **D-100**. A continues from its current numbers
- PHASE_LOG: add rows only (merge-friendly)
- After each phase: commit, push `phase-b`, open a PR into `develop`. Yash merges. Rebase on `develop` before each new phase

## Finish
Both sessions are done → full tsc/vitest/build on `develop`, check every screen against `design/screens/`, Yash merges `develop` → `main`, then A runs Phase 26 (Vercel deploy).
