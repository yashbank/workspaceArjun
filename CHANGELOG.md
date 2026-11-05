# Changelog

## R8 review fixes (feat/owner-danger-zone)

- Dashboard: AQL ceilings reach only `aql.read`. Output and wastage stay per unit, and the chart draws one named unit. The
  on-time widget is now "Delivered of due": DELIVERED only, over orders due up to today (no delivered-at exists).
- Theme Studio: `ui.theme` and the other hidden rule keys are refused by the generic rule editors; heading font selector fixed for selector lists.
- Danger Zone: clearing Employees keeps production logs, job phases and machine allocations (the link blanks, a restore
  refills it). A delete compares a row hash of every table it changes, including blanked ones. A restore refuses a
  second-unique clash by table name and refills only links to parents it brought back. A storage error no longer empties the backup list.
