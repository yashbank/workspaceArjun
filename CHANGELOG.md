# Changelog

## R8 follow-up fixes (feat/r8-followup)

- Combobox: Enter after a search picks the first match and never the None row, and zero matches change nothing. The keys
  live in the component now (cmdk steers by `aria-selected`, which marks the chosen row again). Home/End and Ctrl+N/J/P/K
  stay with the field, the listbox carries the field's label, `aria-controls` points at it, and inside an aria-modal panel the list stays in the panel.
- Danger Zone: a restore is refused, by table name, when a stock book lost rows to a clear and has new rows since; two
  histories are never merged. The Customers text says it also wipes the stock books.
- Desktop wastage report: cut to the range's first and last day, so the label, totals, chart and CSV agree. A week button is an explicit pick and counts back from the range's last day.
- Store: transaction date filters commit on Enter or blur. Stock category and status filters are URL params filtered on the server, so Clear filters and paging cover them.
- `shortcut-platform.ts` folded into `platform.ts`.

## R8 review fixes (feat/owner-danger-zone)

- Dashboard: AQL ceilings reach only `aql.read`. Output and wastage stay per unit, and the chart draws one named unit. The
  on-time widget is now "Delivered of due": DELIVERED only, over orders due up to today (no delivered-at exists).
- Theme Studio: `ui.theme` and the other hidden rule keys are refused by the generic rule editors; heading font selector fixed for selector lists.
- Danger Zone: clearing Employees keeps production logs, job phases and machine allocations (the link blanks, a restore
  refills it). A delete compares a row hash of every table it changes, including blanked ones. A restore refuses a
  second-unique clash by table name and refills only links to parents it brought back. A storage error no longer empties the backup list.
