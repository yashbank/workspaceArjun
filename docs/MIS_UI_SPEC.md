# MIS UI Spec — single source of truth

Read this file INSTEAD of exploring the codebase. It encodes the approved design
(`MIS-ArjunBhaskar/BPP-MIS-UI-Screenshots/screens/R1..R5`) and all code conventions.

## 1. Paths
- App root: `Arjun/app`
- Pages: `src/app/(mis)/mis/<route>/page.tsx` — thin server component only
- Components: `src/components/mis/<area>/<name>-screen.tsx` — `'use client'`
- Server logic: `src/server/mis/<domain>.ts`
- Kit: `src/components/mis/kit/` → `Button, Input, NumberInput, DateInput, TimeInput, Select, Card, CardRow, SlideOver, DataTable, StatusBadge, EmptyState, Skeleton`
- Enums: `import { MisItemUnit, MisItemCategory, ... } from '@/generated/prisma/enums'`

## 2. Server conventions (exact signatures)
```ts
await requireMisAccess()                  // '@/server/mis/guard' → user; feature-flag gate. EVERY page.
const actor = await requirePermission(a)  // '@/server/mis/auth'  → throws MisForbiddenError
const ok    = await checkPermission(a)    // '@/server/mis/auth'  → Promise<boolean>, for canX props
can(role, action)                         // '@/lib/mis/permissions' — sync, role nullable
const role  = await getMisRole(userId)    // '@/server/mis/roles'  → MisRoleName | null
await logAuditEvent({ actorId, entity, entityId, action, before?, after? })  // NO `details` field
```
Roles: `OWNER ADMIN SUPERVISOR QC ATTENDANCE_OPERATOR SUPER_ATTENDANCE_OPERATOR WORKER STORE_GUY`
WORKER is intentionally permission-less (Android kiosk is a separate app).

## 3. Gotchas (these have bitten us)
- `Input` props **omit `type`** — use `NumberInput` / `DateInput` / `TimeInput` instead of `type=`.
- `mis_employees.updated_at` is NOT NULL with **no default** — always pass it on raw SQL insert.
- Item codes use `-` not `/` (`BPP-CUS-013`), else URL encoding breaks.
- Wage/salary figures are OWNER-only. Never write them into `before`/`after` audit payloads.
- Verify with: `node_modules/.bin/tsc --noEmit --skipLibCheck 2>&1 | grep -v seed-demo`
  (`prisma/seed-demo.ts` has pre-existing errors — ignore those, never "fix" them.)

- **Rates are read as of the day being priced, never as of now (D27).** Wage type, OT multiplier and late
  penalty are effective-dated rows that are never edited in place; payroll asks `resolveAsOf(history, day)`
  (`src/lib/mis/effective-dated.ts`) for each attendance day. Reading "the latest row" for a past period moves
  every closed month when a rate changes (F-08). Wage rules are listed in `src/lib/mis/rule-keys.ts` — a rule not
  listed there is shown to Admin on the settings screen; a rule that is listed is hidden from them, refused to their
  editor, and never written into an audit payload (D24).
- **Time is the factory's, never the server's (D22).** Never call `getHours()`, `setHours()`,
  `getDate()`, `getMonth()` or `toLocale*String()` to decide *which day, shift or hour* something is —
  the database (UTC+8) and the plant (IST) are 2.5 hours apart, so a night-shift punch lands on the wrong
  day. Use `src/lib/mis/factory-time.ts` (`factoryDateKey`, `factoryMinuteOfDay`, `formatFactoryTime`,
  `dateKeyToDbDate`) with the zone from `getFactoryTimezone()` (the `factory.timezone` rule, seeded
  `Asia/Kolkata`). The zone is always passed in; nothing here has a default that reads the environment.

## 4. THE DESIGN — phone-width card stack

Every role home is the SAME skeleton; only the cards differ. Container:
`<div className="mx-auto w-full max-w-[420px] flex flex-col gap-3 pb-24">`
Bottom nav is fixed; page needs `pb-24`.

### 4.1 Header card (always first)
White, `rounded-2xl border border-slate-200 p-4`, flex row justify-between:
- Left: `text-2xl font-bold text-slate-900` title (e.g. "Good morning", "Printing · Shift 1",
  "Quality · Shift 1", "Office", "Attendance")
  and under it `text-xs font-mono text-slate-500` — date/time · person.
- Right: A/अ toggle — pill `rounded-full border border-slate-200 bg-white`, two 40px halves,
  active half `bg-white shadow-sm rounded-full`, inactive `text-slate-400`.

### 4.2 Card vocabulary (use these exact tones)
| Purpose | Classes |
|---|---|
| **Action / waiting on you** | `bg-indigo-50 border border-indigo-200 rounded-2xl p-4` |
| **Warning / blocker** | `bg-amber-50 border border-amber-200 rounded-2xl p-4` |
| **Failure** | `bg-red-50 border border-red-200 rounded-2xl p-4` |
| **Healthy / online** | `bg-green-50 border border-green-200 rounded-2xl p-4` |
| **Neutral info** | `bg-white border border-slate-200 rounded-2xl p-4` |
| **Owner-only money** | `bg-indigo-50 border border-indigo-200 rounded-2xl p-4` + 🔒 `VISIBLE TO YOU ONLY` |

### 4.3 Atoms
- Section label: `text-[11px] font-semibold uppercase tracking-wider text-slate-500`
- Big number: `text-4xl font-bold text-slate-900`; the "/total" part `text-lg text-slate-400`
- Alert row: colored dot `h-2 w-2 rounded-full mt-1.5` + `font-semibold text-slate-900` title
  + `text-sm text-slate-500` detail line. Red dot = stopped, amber = at risk.
- Primary button: `w-full rounded-xl bg-indigo-600 py-3.5 text-base font-semibold text-white hover:bg-indigo-700`
- Secondary (inside amber card): `w-full rounded-xl bg-white border border-amber-300 py-3 font-semibold text-amber-900`
- Mono for codes/IDs: `font-mono text-xs text-slate-500` (e.g. `ORD-118`)

### 4.4 Content rules (from the design notes — do not violate)
1. **Action above information.** The thing that unblocks work is the top card, always.
2. **Alerts are specific.** Never "3 issues" — name the machine, the order, since when, who raised it.
3. **Yesterday, not today.** Early-morning figures read as an idle factory; show the closed day.
4. **The money card exists on exactly one screen** (Owner). Other roles: absent, not greyed.
5. **Counts, not rosters.** "14/17 · 2 absent · 1 on leave", names one tap away.
6. **Dashed border = never recorded** (an absence of data), distinct from grey = recorded state.

### 4.5 Bottom nav — 5 tabs, fixed
`fixed bottom-0 inset-x-0 mx-auto max-w-[420px] bg-white border-t border-slate-200 grid grid-cols-5`
Tab: icon 22px + `text-[11px]`. Active `text-indigo-600 font-semibold`, inactive `text-slate-500`.
Badge: `absolute -top-1 -right-2 bg-indigo-600 text-white text-[10px] rounded-full h-4 min-w-4 px-1`.

| Role | Tabs |
|---|---|
| OWNER | Home · Approvals(badge) · Orders · Reports · Settings |
| ADMIN | Home · Orders · Masters · People · Reports |
| SUPERVISOR | Home · Machines · Jobs · Crew · Me |
| QC | Home · Checks · Defects · COA · Me |
| ATTENDANCE_OPERATOR / SUPER | Home · Register · Leave · Kiosk · Me |
| STORE_GUY | Home · Stock · Receive · Issue · Me |

### 4.6 Per-role home content
- **OWNER** — "Waiting on you" approvals (indigo, count + 2 rows + Review approvals) → NEEDS ATTENTION
  (specific alerts) → YESTERDAY (3 stats: Output Nos / Wastage Kg / Machines run) → wages card (owner-only).
- **ADMIN** — 3 icon shortcuts row (New order · Issue job card · Masters) → ORDERS NEEDING YOU
  (each row states the next action, `Go` / `Late risk` chips) → Attendance today `61/70` →
  amber data-health card ("6 masters missing a Hindi name" → Fix them).
- **SUPERVISOR** — big `+ Record production` primary button FIRST → amber line-clearance blocker →
  MY MACHINES 3-up (Free/Running/Down, green/amber/red) with "All 21 visible" → WAITING ON YOUR
  SIGN-OFF list → My crew today `14/17`.
- **QC** — indigo countdown card ("10:00 check due in 8 min", `Start the 10:00 check`) → hourly slot
  grid 4×2 of 8 tappable slots (green pass / red fail / grey make-ready / **dashed = never checked**,
  legend in words) → red failure card → ALSO TODAY list.
- **ATTENDANCE_OPERATOR** — green kiosk-health card ("Gate kiosk online · Synced 40 seconds ago") →
  Clocked in today `61/70` + chips (4 late / 3 on leave / 2 absent) → amber "2 forgot to clock out"
  → LATE THIS MORNING list.
- **SUPER_ATTENDANCE_OPERATOR** — same, plus two cards with **dashed indigo borders**: "Corrections open
  5 Sep – 7 Sep · 3 days back" + Open corrections, and "Waive today's lateness" toggle with reason note.
- **STORE_GUY** — stock health (low-stock count, amber if >0) → today's IN/OUT counts →
  open GRNs awaiting entry → quick actions: Receive (GRN) · Issue · Count.

## 5. Store cart flow (GRN receive / issue)
One screen, three zones, phone-first:
1. **Search/scan bar** pinned top — filters items by code or name, shows 5 matches max.
2. **Tap a result → adds a line to the cart** with qty 1, then `−  qty  +` stepper and a unit label.
   Editing qty inline; swipe/× removes the line. Cart is client state until commit.
3. **Sticky footer**: `N items · total qty` + full-width primary `Confirm receipt` / `Confirm issue`.
On commit: one server action writes the GRN/issue header + all lines + the inventory ledger rows in a
single `db.$transaction`, then `revalidatePath`. Never write ledger rows one-by-one from the client.
Empty cart → `EmptyState` with "Scan or search an item to start".

## 6. Purchase orders — two paths, both normal

A PO is raised one of two ways, and neither is the exception:

| Purpose | BOM Ref | What it means |
|---|---|---|
| **From BOM requirement** | required | Materials a BOM / material request asked for, behind a customer order. |
| **Buffer stock (no BOM)** | absent | A top-up of stock the factory keeps on hand. No BOM, no order. |

Rules that follow from it (client change, Sep 2026 — Arjun):
1. **No BOM is not a missing link.** Never block, warn on, or chase a PO with no
   `bomRef`. `mis_purchase_orders.bom_ref` is nullable and has no FK — nothing
   in the schema ever required one.
2. **The raiser picks the purpose, the field follows.** `New PO` shows a Purpose
   select; `FOR_ORDER` requires a BOM Ref, `BUFFER_STOCK` hides it and stores
   `null`. `createPO` enforces both, so a null `bomRef` means buffer stock and
   not a field somebody forgot.
3. **Derive, do not store.** `poPurpose()` / `poPurposeLabel()` in
   `src/lib/mis/po-purpose.ts` — pure, client-safe, imported by the screens.
   Never import `@/server/mis/po` into a `'use client'` file.
4. **Every PO surface names the purpose** — list column, detail card, printed PO,
   approval queue row, and the receive screen's PO chip. An approver signing a
   buffer-stock PO should know that is what it is.
5. **Receiving is identical.** GRN hangs off the PO, not off an order; a
   buffer-stock PO receives, prices and closes exactly like any other.

## 7. Migrations — always `db:deploy`, never `db:migrate`

`pnpm db:migrate` (`prisma migrate dev`) replays every migration into a **shadow database**
to check history. That shadow DB is a bare Postgres with no Supabase `auth` schema, so
`20260914000000_mis_attendance_bom_schema` — which adds `mis_documents.uploaded_by` as an FK
to `auth.users` — always fails there with `P3006` / `P3018` / `3F000 schema "auth" does not exist`.
The real database is unaffected; only the shadow replay breaks.

**Apply migrations with `pnpm db:deploy && pnpm db:generate`.** `migrate deploy` uses no shadow
database, applies only what is pending, and is the correct command for a hosted Supabase DB.
Do NOT edit `20260914000000_...` to "fix" it — it is already applied and Prisma checksums
applied migrations; changing it breaks the history for everyone.

### 7.1 The one database trigger in this schema — `mis_job_phase_gate`

There is exactly one trigger in the MIS, added by Phase 7. If an insert or update to
`mis_job_phases` fails with a message starting `mis_job_phase_gate:`, **this is what hit
you, and it is working as designed** — read this section rather than debugging Prisma.

**What it enforces** (the BPR's own rule, printed on the client's form: *"Section receiving
BPR should not accept BPR if it is not signed by previous section"*):

> A phase row may only arrive at, or move into, `IN_PROGRESS` when the previous phase on the
> same order — by `sequence`, skipping any phase whose status is `NOT_APPLICABLE`, ignoring
> soft-deleted rows — is `SIGNED_OFF`. A phase with no applicable predecessor is startable.
> `REOPENED` is not `SIGNED_OFF` and therefore blocks.

**The exact error text.** One `RAISE EXCEPTION`, `ERRCODE = check_violation` (SQLSTATE
`23514`), formatted with three values — the starting phase's sequence, the blocking phase's
sequence, and the blocking phase's status:

```
mis_job_phase_gate: phase 4 cannot start until sequence 2 is signed off (it is IN_PROGRESS)
```

**Why a trigger and not a `CHECK`.** A `CHECK` constraint cannot see sibling rows, and this
rule is entirely about a sibling. The four `CHECK` constraints on the same table cover only
the single-row rules (a `SIGNED_OFF` row must carry both `signed_off_at` and
`signed_off_by_id`; `NOT_APPLICABLE` and `REOPENED` must carry a non-empty reason; anything
past `PENDING` must carry `started_at`).

**It is not redundant with the server module.** `src/server/mis/job-phases.ts` refuses the
same transition first, with a message naming the blocking phase *and its in-charge*, which
is the one users see. The trigger exists for everything that never goes through that module
— a seed script, a migration backfill, a bulk import, a psql session, and the code path
nobody remembered. If you are seeing the raw trigger text in the UI, a write is bypassing
the server module: fix that, do not catch and rewrite the message.

**Do not disable it to make a seed or a test fixture pass.** Insert the phases in sequence
order and sign them off as you go, the same way the factory does. The full transition table
it enforces is `DEVELOPMENT_GUIDE.md` **Appendix A**.

### 7.2 The second database trigger — `mis_attendance_punch_immutable`

Added by Phase 13. If an UPDATE or DELETE on `mis_attendance_punches` fails with
`mis_attendance_punch_immutable: punches are never updated — record a correction instead`,
**this is working as designed** (K2: "nothing here is ever overwritten in place"; attendance
decides pay). A correction is an INSERT of a new row whose `supersedes_id` names the punch it
replaces and whose `correction_reason` says why; both rows are kept. If you are seeing the raw
trigger text in the UI, something is trying to edit a punch — fix that, do not catch and rewrite
it, and do not disable the trigger to make a seed or test pass. `TRUNCATE` is not blocked, so a
workspace reset can still clear the table.

## 8. Verification — `tsc` is the inner loop, `pnpm build` is the gate

`prisma/*.ts` are tsx-run scripts, not part of the Next bundle, and `prisma/seed-demo.ts`
carries 10 pre-existing errors from schema drift. `tsconfig.json` now excludes `prisma/**`
(it previously excluded only `prisma/seed.ts`, which is why `next build` still failed on
seed-demo while filtered `tsc` looked clean).

Consequence: **`node_modules/.bin/tsc --noEmit --skipLibCheck` must now be silent with no
grep filter.** If you find yourself piping it through `grep -v`, something regressed — fix
the cause, don't widen the filter. `pnpm build` is the real acceptance gate and must pass
before a phase is called done.

**Tech debt:** `prisma/seed-demo.ts` (and `seed-reset.ts`) are stale against the current
schema and now unchecked. The live DB already holds real seeded data, so these scripts are
candidates for deletion rather than repair. Do not "fix" them inside an unrelated phase.

**Update (Phase 4):** `db:migrate` is now an *alias* of `prisma migrate deploy`, identical to
`db:deploy`. Agents kept echoing the script name `db:migrate` from package.json even when the
phase prompt said `db:deploy`, and hit the shadow-database failure every time. Both names are
now safe. `db:migrate:dev` exists only to refuse with an explanation — this project hand-writes
migration SQL into `prisma/migrations-pending/`, so `migrate dev` has no role here.

## 9. THE design reference — `Arjun/design/screens/` (deduped, Phase 11)

One clean folder, 64 uniquely-named artboards. **Use only this path.** The old
`MIS-ArjunBhaskar/BPP-MIS-UI-Screenshots/` tree is superseded: it held the same images
scattered across `screens/`, `ui2/`, `Claude outputs/` and `by-ticket/` with numeric-prefix
duplicates, and — critically — the copy earlier phases were pointed at was **missing the
entire D-series**. `Arjun/design/_MAPPING.md` and `_map.json` map artboards to MIS tickets.

| Prefix | Layer |
|---|---|
| `01`–`10` | Foundations, components, print sheets |
| `R1`–`R5` | **Phone** role homes (built, Phases 1-11) |
| `D1`–`D14` | **Desktop** — NOT BUILT. See Phase 24. |
| `P1`–`P5` | Patterns (machine board, QC grid, approvals) |
| `S1`–`S8` | Screens (BOM tree, business rules, documents) |
| `K1`–`K12` | Kiosk (Phases 12-13) |
| `W1`–`W10` | Workflows (PO capture, job card, sign-off) |

**There are exactly two layouts, not three.** Below 1024px the desktop collapses into the
phone home — same widgets, one column, charts degrade to sparklines. Never invent a third.

## 10. Supabase MCP — reads only, never writes

The account-level Supabase connector (`claude.ai` config, 29 tools) is available and has
**write capability**. Do not use it for writes.

**Rule: every schema change goes through Prisma.** `prisma/migrations/` is the source of
truth and `_prisma_migrations` is its ledger. DDL applied through `execute_sql` or
`apply_migration` is invisible to that ledger, so the next `pnpm db:deploy` either fails or
re-applies a change that already exists — and the drift is discovered at the worst moment.

**Allowed via MCP:** `execute_sql` for SELECTs, `list_tables`, `get_advisors`, `query_logs`,
`search_docs` — inspecting reality to check your work.

**Never via MCP:** CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, `apply_migration`, or
anything under branching, functions or account. If a schema change is needed, write the SQL
to `prisma/migrations-pending/` and follow the SCHEMA GATE.

Reading the live DB to verify a migration landed is not only allowed, it is encouraged.
