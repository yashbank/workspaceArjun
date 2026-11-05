# R8 handoff to Mac A

Branch `feat/owner-danger-zone`. Nothing is merged, deployed or migrated. This branch adds no migration.

## Stop rules
- Merge and deploy only after the Owner says so.
- **Never press Delete or Restore in Danger Zone on the live site** unless the Owner decides to clear real data. Delete works on whole tables, so there is no "dummy customer only" delete. A live delete removes all real rows in the selected groups.
- Do not apply anything from `prisma/migrations-pending` for this work. The 10 parked folders there are older and unrelated.
- Do not run plain `pnpm test` with production URLs in `.env.local`: `src/server/mis/job-phases.gate.db.test.ts` connects to that DB. It rolls back, but use this instead:
  `pnpm vitest run --exclude '**/job-phases.gate.db.test.ts'`
- Do not run `tests/ui-overhaul`: it needs Mac B's throwaway Postgres and fake auth. It is hard-coded to localhost and fake accounts.

## Results on Mac B
All local: throwaway Postgres, fake auth, local storage. The one exception is the real bucket run, which used dummy data under `data-reset/backups/` and removed its own objects.

| Round | Result |
|---|---|
| R1 | typecheck clean, lint 0 errors, 7307 unit tests passed, 3 expected fail, 1 skipped; job-phases DB test excluded |
| R2 | Danger Zone, theme and widget specs 40 passed on the final fixes. Earlier on `fa0870f`: lists and widgets 39/39, nav and permission boundaries 33/33, login 7/7 |
| R3 | T5 7/7 on `fa0870f` (720 width checks, 320 to 1440), not re-run after the review fixes. Code review: 10 findings, all fixed |
| Bucket | Backup, signed download, tamper refusal and restore passed; one earlier run timed out over 180 s |
| Build | `pnpm build` passed on `ea3e794` |

## Not proven
- Danger Zone on Supabase: rights for `LOCK TABLE` and `TRUNCATE`, and behaviour on the transaction pooler.
- Vercel time limit: the bucket run takes about 95 s on small dummy data, and real data is larger. Check `maxDuration` on the Danger Zone actions.
- Playwright against a production build (all runs used `next dev`).
- BOM rows on the approvals screen (parked `mis_bom.version` is not on the local DB).
- Whether the main DB is unchanged by the rolled-back test runs described below.

## Owner decisions
1. Clearing customers or orders also deletes all POs, including buffer stock, plus GRNs and supplier invoices. Accept?
2. That clear empties `mis_store_transactions` but keeps the ledger, so stock may read 0 (from reading the code, not run). Accept or change?
3. Theme Studio is gated on `data.reset`. A proper `theme.write` needs a fifth Owner-only action and a change to `permissions.test.ts`. Approve?
4. Inventory, store stock, store transactions and supplier-invoices stay on the old list form, because `search-inputs.test.ts` requires at least 25 search inputs. Approve lowering that?
5. Searchable dropdowns use the repo's `combobox`. Shadcn Command+Popover needs `cmdk` and a popover package. Approve?

## Known gaps
- Clearing Employees still empties `mis_worker_allocations`, including kept staff's rows.
- A restored row whose parent is outside the backup fails with a generic error; nothing is left half restored.
- Restoring an older backup can refill a link cleared before a newer delete.
- Widget titles "Output · yesterday" and "AQL this month" stay when the range changes, because an existing test pins them; the body shows the range. `owner-home.tsx` hardcodes "Output Nos" and "Wastage Kg".
- The desktop wastage report ignores `at` and has no range tabs.
- "Delivered of due" replaces on-time: no delivered-at timestamp exists, and the 95% target is hard-coded.
- There is no output-against-plan line (no plan data). Theme Studio does not cover email (MIS has no email templates).
- `useListNav` keeps a try/catch around `useRouter` so screen tests render without a router.

## Main DB contact
On Mac B, plain `pnpm test` ran several times with production URLs in `.env.local`, so `job-phases.gate.db.test.ts` connected to the main DB. It inserts one test order and phase rows inside a single transaction and rolls back. Nothing should remain. To confirm, look for an order the test created; if any exists, tell the Owner.

## Danger Zone live test (no data is deleted)
Sign in as Owner on the deployed site.
1. Open Settings > Danger Zone. The warning gate appears.
2. Sign in as Admin in another browser and open the same URL. It is refused.
3. As Owner, select Customers. The cascade tree appears with row counts. Check two counts against the Customers and Orders lists.
4. Take a backup. It must finish without a timeout, and Delete stays disabled until it is verified.
5. Download the JSON and CSV zip. Names follow `bpp-backup-<scope>-YYYY-MM-DD_HH-mm-ss`.
6. Press Cancel. Confirm Customers and Orders are unchanged.
7. Stop here. Report any error from step 4 with the Vercel log.

## Tester message
> New build is ready. Please check: (1) lists for PO, GRN, QC, production, orders, suppliers, BOM, employees and audit now share one search and filter bar, and most have a card/row toggle; (2) dashboard widgets and reports have Day, Week, Month, Quarter and Year; (3) phone layouts at small widths have no sideways scrolling. Owner only: Settings > Theme Studio. Please do not use Danger Zone. Report anything odd in the sheet.

## PR
Title: `R8: Danger Zone fix and UI overhaul`

Body:

```
Danger Zone follows every FK, with a cascade tree, mandatory verified backup and FK-safe restore. Adds shared list toolbar, day-to-year range on widgets and reports, Theme Studio and responsive fixes.

Tests: see docs/ui-overhaul/MAC_A_HANDOFF.md. No migrations. Not merged by Mac B.

Files outside a mis folder:
- src/app/globals.css: shared shimmer, hover motion and theme variables
- src/server/storage/index.ts, s3-upload.ts: createPresignedGetUrl for backup downloads

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
