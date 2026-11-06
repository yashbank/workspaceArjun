# R9 go-live round — Mac B. Same rules as MAC_B_HANDOVER.md: parallel subagents, Playwright on Mac B (3 rounds), short replies, no migrations applied without asking, never merge, never run a real wipe against production.

A. Google login: Admin/Super admin (Owner/Admin roles) signing in with Google must land in the admin (/mis) area, never the customer area; customer area must be blocked for them. Playwright: each role x password+Google paths.
B. Danger Zone: add Partners and Payouts (incl. all test partners e.g. xyz@/abc@/qwe@gmail.com) and every ledger trace to the clearable groups + cascade tree + backup/restore. After clear, Partners and Payouts, widgets and ledger show 0. Customers must show 0 after a customer clear. Fix widgets that don't refresh after clear/range change (cache/revalidate).
C. UI: row/card actions collapse into ONE 3-dot menu (consistent across all lists, all roles). Fewer palette/border/button options in Theme Studio. Widgets: customizable, correct data, modern, per role.
D. Bugs: /mis/store React #419 for QC/Attendance roles; /mis/attendance horizontal scroll at 390px.
E. CORS: central policy (allowed origins/methods/headers) for new content/landing/blog routes; origins in env var CORS_ALLOWED_ORIGINS (owner supplies values). Also check security headers/CSP.
F. Content: create docs/content/CONTENT_TEMPLATE.md + CSV template for the content guy (landing, blog, per-product pages). Loader script that imports it. Do not invent content.
G. Admin seed script (NOT run): adds 2 super admins + 1 info@ partner (role to be supplied by Owner) from env vars; removes old admins only when run with explicit --confirm after new admins verified. Test credentials sheet template (no real passwords committed).
Output: PR to main + <=10 line report + tester message.
