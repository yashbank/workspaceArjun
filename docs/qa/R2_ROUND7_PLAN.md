# R2 Round 7 plan: R2-374..R2-384 (12 rows incl. duplicate id 381a/b). Branch fix/r2-round7 from origin/main a9941ae.
Bugs verbatim: `R2_ROUND7_BUGS.md`. Sheet 1dZbhlD4uEtJ8amGx_v-p6MTuKCxoJfqqG2Mq7eqnAtM / Bugs rows 415-426. Logs: `round6/MAX_LOG.md` style, append-only `round7/MAX_LOG.md`.
No schema change, no decisions needed (defaults below). Existing tests: do not edit/delete assertions.

## Batches (2 builders, disjoint files)
- W1 (web builder): R2-374,375,376,377 in supplier-invoices. New files preferred: `invoice-action-dialog.tsx`, `invoice-kpi-strip.tsx`, `invoice-export.ts`; minimal edits to screen. Existing `supplier-invoices-screen.test.tsx` must still pass; add `r2-374-377-supplier-invoices.test.tsx`.
- W2+A1 (builder 2): R2-378,379 (bom.ts, bom-list-screen.tsx, new test `r2-378-379-bom-number.test.tsx`); then Android R2-380..384 (+ Kotlin unit tests where the module already has a test dir; WorkDate guard test).
## Defaults
- 376 KPI counts from existing paging.counts; if a bucket missing, add count in server fn without changing existing return fields.
- 377 CSV client-side from rows already on screen; Print Voucher = printable route/`window.print()` view of one invoice. Amounts only for roles that already see them.
- 375/374: Dialog per invoice, state local to dialog component; table keeps status badge + "Update status" button; old inline controls removed from `<td>` but same server actions called.
## Preserved behaviour
Supplier-invoice server actions, 3-way match, permissions (ACCOUNTS/OWNER write), bom search by order no./customer, kiosk pairing/punch queue flows.
## Gates: tsc, eslint, vitest (count >= baseline), build, Playwright (existing + e2e/r2-round7.spec.ts), Gradle testDebugUnitTest + assembleDebug.
