# Go-live QA report (read-only sweep, localhost:3000, branch golive-qa)

Date: 2026-11-13. Spec: `e2e/golive/role-sweep.spec.ts` (config `e2e/golive/playwright.config.ts`).
Run: `E2E_BASE_URL=http://localhost:3000 npx playwright test -c e2e/golive/playwright.config.ts`
(plain `npx playwright test e2e/golive` uses the root config, which also runs the auth.setup project first.)
Raw per-role results: `e2e/golive/results/<ROLE>.json`; screenshots: `e2e/golive/screenshots/` (all show the 404 page).

## Outcome: BLOCKED. Every role gets 404 on every /mis/* URL.

All 7 logins authenticate (login redirects to `/`, 200), but `GET /mis` and every `/mis/*` page returns 404
("This page does not exist") for every role at 1280, 820 and 390 widths. Cause (code evidence):
`src/app/(mis)/mis/layout.tsx` calls `requireMisAccess()` (`src/server/mis/guard.ts`), which calls `notFound()` unless
`isMisEnabled(user.id)` (`src/server/mis/flags.ts`), i.e. the user's profile id must be listed in the env var
`MIS_ENABLED_ACCOUNTS` (comma-separated user ids; default is nobody). `.env.local` holds an allow-list of only 3 ids
and none of the tested accounts (OWNER e2e account, the 5 new csv logins, ATTENDANCE_OPERATOR e2e account) is in it.
I could not confirm id-by-id: the DB lookup script was blocked by the permission classifier, and I did not work around it.
No source/env edits were made (read-only brief), so no further checks were possible.

Same applies to production: the 26 new users will see 404 until their ids are added to `MIS_ENABLED_ACCOUNTS` on Vercel.

## Per-role table

Logins used: OWNER = E2E_OWNER_EMAIL (.env.e2e, works); ADMIN = Girdharilal Dhard; SUPERVISOR = Kali charan; QC = CHV.Satyanarayana;
STORE_GUY = Kanthi Mallesh; SUPER_ATTENDANCE_OPERATOR = K.Kalyani; ATTENDANCE_OPERATOR = E2E_ATTENDANCE_OPERATOR_EMAIL (works).

| Role | (a) login | (b) brand-mark + nav | (c) home, console, no hscroll | (d) demo data | (e) money visibility |
|---|---|---|---|---|---|
| OWNER | PASS | BLOCKED (404, no shell) | FAIL: /mis 404 + console "Failed to load resource 404" | BLOCKED | BLOCKED |
| ADMIN | PASS | BLOCKED | FAIL (404) | BLOCKED | BLOCKED (no leak seen only because no page renders) |
| SUPERVISOR | PASS | BLOCKED | FAIL (404) | BLOCKED | BLOCKED |
| QC | PASS | BLOCKED | FAIL (404) | BLOCKED | BLOCKED |
| STORE_GUY | PASS | BLOCKED | FAIL (404) | BLOCKED | BLOCKED |
| SUPER_ATTENDANCE_OPERATOR | PASS | BLOCKED | FAIL (404) | BLOCKED | BLOCKED |
| ATTENDANCE_OPERATOR | PASS | BLOCKED | FAIL (404) | BLOCKED | BLOCKED |

Counts: 7/7 login PASS; 0/7 any other check verifiable. Not checked at all: brand-mark, Factory icon, orders/BOM/PO/GRN/invoice/production/QC/
attendance/payroll demo data, widget numbers, wage leak on dashboard and /mis/audit, OT/night-shift (EMP131) hours, wage arithmetic.
The 404 page itself has no horizontal scroll at 390px; nothing else is known.

## Bugs found

1. BLOCKER (config, not code): new users and e2e accounts not in `MIS_ENABLED_ACCOUNTS`, so MIS 404s for everyone.
   Files: `.env.local` (local), Vercel env (prod); gate in `src/server/mis/flags.ts`, `src/server/mis/guard.ts`.
   Fix: add all 26 new profile ids plus owner/e2e ids to the var, restart dev server (env read at runtime but dev needs restart), re-run the spec.
2. MEDIUM (UX/ops): a successful login for a non-allow-listed user lands on `/` and then 404s on /mis with no explanation;
   consider a go-live pre-flight script that asserts every active UserProfile with an MIS role is in the allow-list.
   Suspected file: `src/server/mis/flags.ts` (allow-list design) or `scripts/golive/`.
3. LOW (e2e infra): root `playwright.config.ts` defaults to the Vercel URL and `retries: 1`; the golive spec refuses non-localhost and has its own config.

## Next step
After fixing #1, re-run the spec: it logs in once per role, visits sidebar links + key pages (about 22 loads per role),
captures text, console/http errors, money regex hits, brand-mark and Factory-icon counts, and horizontal scroll, then review the JSON.
