# R8 UI/UX Overhaul + Danger Zone fix — Plan (handover to Mac B)

Branch: feat/owner-danger-zone (contains Owner's WIP Danger Zone, BROKEN: see T0). UI/UX + Danger Zone only. No new features/flags.
Tester sheet export: docs/ui-overhaul/tester-sheet-bugs.csv (365 rows; all resolved or Deferred-by-design => skip deferred). Live sheet "MIS Testing R2-V2" id 1dZbhlD4uEtJ8amGx_v-p6MTuKCxoJfqqG2Mq7eqnAtM. UI UX tab: searchable dropdowns = shadcn Command+Popover.

## T0 Danger Zone — FIX FIRST (owner tried on localhost: selection ignores FK dependencies)
Files: src/server/mis/data-reset.ts, src/lib/mis/data-reset-groups.ts(+test), src/components/mis/settings/danger-zone-screen.tsx, src/app/(mis)/mis/settings/danger-zone/.
- Derive dependency graph from prisma/schema.prisma (FKs), not a hand list. Test: every FK child of a selected table is in the delete set or the op is refused.
- Selecting a parent (e.g. customers) auto-selects ALL dependents (orders, BOM, POs link, production, stages, machine allocation, dispatch, invoices, QC, docs...). UI shows full cascade tree with row counts BEFORE delete.
- Warning choice: "Delete customers + ALL related data" vs "Cancel". If only parent is wanted and children block, say so; never leave orphans or FK errors. Delete in leaf->root order inside ONE transaction; all-or-nothing.
- Per-module clear: leads, customers, production, stages, machine allocation, clear-all.
- Auto-backup BEFORE delete (no skip): JSON (lossless, restorable) + CSV zip; name `bpp-backup-<scope>-YYYY-MM-DD_HH-mm-ss`; upload to the existing Cloudflare R2 bucket via the platform's current file-storage layer (reuse it, owner-only prefix) AND browser download. Verify upload + checksum before enabling Delete. Restore flow (FK-safe order) + restore test.
- Owner-only (server-enforced), entry warning gate, typed confirmation, audit log. Runs on real prod data: test only with a dummy customer chain.

## Tracks (parallel agents, worktrees, disjoint files)
T1 Design system: tokens, shadows, buttons, inputs, search, debounced filter bar, skeleton loaders, hover motion, modals/overlays/tabs/icons.
T2 One list pattern for ALL lists/roles (BOM cards vs rows today = inconsistent): same toolbar, card/row toggle, pagination, filters, empty/loading. Server pagination+filters on employees, BOM, audit.
T3 Theme Studio (Owner only): palettes, font pairs with live preview, org-wide, CSS vars; also drives print, badge cards, emails.
T4 Widgets: wire every admin/other widget to real queries; interactive frequency (day/week/month/quarter/year); dashboard + reports follow same range.
T5 Responsive QA 320/375/768/1024/1440+, every role/tab/table; Playwright specs in tests/ui-overhaul/.

## Rules
Token-lean: spawn track agents in parallel, small diffs, reuse existing components, finish fast (usage limit tight). Prisma migrations -> prisma/migrations-pending; STOP and ask Owner before applying. Mac B writes + runs Playwright (incl. Danger Zone on dummy data: backup verified + restore proven before delete). Gates: typecheck, lint, unit, playwright green. Then push, open PR to main, give confident report. Mac A applies migrations, merges, deploys, tests live.
