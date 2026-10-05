# MIS Kiosk — Tester Guide

## Setup
1. Install the APK on the tablet.
2. Open the app → note the pairing code shown.
3. Ask an admin to approve it: website → Settings → Devices → enter the code.
4. App shows "Operator sign-in" — enter any employee code, tap **Start shift**.

## Test Cases

| # | Test | Steps | Expected |
|---|---|---|---|
| 1 | Manual punch IN | Enter code manually → real badge code → Confirm | "Punched IN", count goes up |
| 2 | Manual punch OUT | Same employee, same code again | "Punched OUT" (auto-toggles) |
| 3 | QR punch | Scan a printed badge QR | Confirm card shows correct name → punch works |
| 4 | Wrong code | Type a fake code | "Not recognised", no crash |
| 5 | Rapid taps | Tap Confirm 3x fast | Only ONE punch sent (check website shows 1 entry, not 3) |
| 6 | Offline queue | Turn off wifi → punch → turn wifi back on | Shows "queued", auto-sends within ~10s of reconnect |
| 7 | Device health | Hold top status bar 3 seconds | Opens health screen (battery, sync, storage) |
| 8 | Shifts screen | From health screen → "View shifts" | Shows shift list, no crash |
| 9 | Queue screen | From health screen → "View queue" | Shows recent/queued punches, no crash |
| 10 | End shift | From health screen → "End shift / hand over" | Returns to Operator sign-in screen |
| 11 | Website sync | After any punch, check website admin panel | Same punch appears there |
| 12 | Multi-employee | Repeat #1 for 4-5 different employees | No mix-ups, correct names each time |

## Report a Bug
Note: what you did, what you expected, what happened, and the time (helps match against server logs).
