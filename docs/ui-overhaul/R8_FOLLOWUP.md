# R8 follow-up — Owner decisions (PR #107 merged to main). Mac B: do these, same rules as MAC_B_HANDOVER.md. Keep replies short; parallel subagents; Playwright on Mac B; no migrations applied without asking; do not merge.

1. ACCEPTED: customers/orders clear also deletes all POs (incl. buffer stock), GRNs, supplier invoices. No change.
2. Clear must WIPE store transactions AND the stock ledger/entries, plus every widget/report that reads them, so no stale stock or totals remain (stock = 0 consistently). Show these in the cascade tree and backup; restore must bring them back. If wiping the ledger is unsafe for some table, choose the safest consistent option and say so in 1 line.
3. APPROVED: add Owner-only `theme.write` (5th Owner-only action); update permissions.test.ts; move Theme Studio gate from data.reset to theme.write.
4. APPROVED: lower the search-inputs.test.ts minimum; migrate Inventory, store stock, store transactions, supplier-invoices to the shared list toolbar/pattern.
5. APPROVED: searchable dropdowns use shadcn Command+Popover (add cmdk + popover pkg). Add OS-aware shortcut hint: Mac shows ⌘K, Windows/Linux shows Ctrl K (detect via navigator.userAgentData?.platform / navigator.platform, SSR-safe, no hydration mismatch); the handler must accept metaKey on Mac and ctrlKey elsewhere.

Known gaps to also fix if cheap: Employees clear must not wipe kept staff's mis_worker_allocations; desktop wastage report should honour range tabs.
Gates: typecheck, lint (src/tests), vitest (exclude job-phases.gate.db.test.ts), Playwright. Open PR to main.
