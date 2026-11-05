# R8 overnight run plan (timebox: 4 h target, 5 h hard stop)

Owner is asleep during this run. Nothing is merged and no migration is applied to the main DB.

| Elapsed | Work |
|---|---|
| 0:00-0:30 | Setup: temporary local Postgres, tester CSV, push proof |
| 0:30-2:00 | T0 Danger Zone (lead) in parallel with T1 design system (worktree) |
| 2:00-3:15 | T2 list pattern and T4 widgets (worktrees, max 2), T3 Theme Studio |
| 3:15-4:00 | T5 responsive, R1 + R2 + R3 verify rounds |
| 4:00-4:30 | Fixes, push, PR link, report, Mac A prompt |
| 5:00 | Hard stop: ship what is green, list what is not |

Cut order if late: T5 breakpoints beyond 375/1440, then T3 extras (print, badges, emails), then T4 reports. T0 is never cut.

## Safety rules for this run
- Delete, restore, theme saves and new-migration work run only on the temporary local Postgres. `deleteSelectedData` is whole-table, so it never runs on the main DB.
- New migrations go to `prisma/migrations-pending`, not applied.
- Max 2 worktrees (5.8 GB free).
