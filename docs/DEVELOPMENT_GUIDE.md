# MIS Development Guide — the phased execution plan

_Written 2026-09-15. Drives the remaining Bhaskar Paper Products MIS build to done._

This is the only file you need open to run the project. It turns the **92 genuinely
unbuilt issues** found in [`TICKET_INVENTORY.md`](./TICKET_INVENTORY.md) into 22
sequential phases, each one session's worth of work, each with the model to use,
the acceptance check, the verify command, and the literal prompt to paste.

**Why it is shaped like this.** This project has already paid for rework twice: screens
built without following the approved designs, and "progress" reported from file counts
instead of verified reality. Neither is fixed by a better model — both are fixed by
structure. So: one ticket per agent, a separate agent that checks it, a design spec read
instead of a codebase explored, and a verify command that either prints nothing or fails.
The cheap model is the default. The expensive model is reserved for the four places in
this plan where the answer is genuinely not decided yet.

---

## 0. How to run a phase

1. Open a **fresh** Claude Code session in VS Code. One phase per session — context
   exhaustion is the single biggest driver of cost and of sloppy output.
2. Paste the phase's **Prompt** block verbatim. It is self-contained, and it carries the
   **Phase Contract** (§1A) that the agent must follow at both ends of the phase.
3. When the phase reports done, run the **Verify** command yourself in the VS Code
   terminal (see §2 — some of it only runs on your Mac, not in the agent's shell).
4. Tick the phase off in §4. Then start a new session for the next phase.

Do not run two phases in one session. Do not ask the agent to "also just quickly" do
the next thing. That is how the last rework happened.

Every phase reads the project's state from `PHASE_LOG.md` and the previous phase's report,
and writes its own back. That loop is **§1A, the Phase Contract**, and it is mandatory —
it is what keeps this guide true after the first phase changes something.

---

## 1. Read this before anything else

- [`MIS_UI_SPEC.md`](./MIS_UI_SPEC.md) — the design system, the exact server signatures,
  the role→tab map, the per-role home content, and the gotchas that have already bitten
  us. **Agents read this instead of exploring the codebase.** It is the single source of
  truth for "what should this screen look like".
- [`TICKET_INVENTORY.md`](./TICKET_INVENTORY.md) — all 294 Jira issues cross-checked
  against the code. Every YES/PARTIAL/NO verdict below comes from there.
- [`DECISIONS.md`](./DECISIONS.md) — **the assumed-decision registry.** Four questions
  Arjun has not answered yet, each with the value we are building on, why, and exactly
  which phases to re-run if the answer comes back different. **Phases cite `D1`–`D4`; they
  never restate a value.** If you need an assumed value, read it there.
- [`PHASE_LOG.md`](./PHASE_LOG.md) and [`phase-reports/`](./phase-reports/) — what the
  phases before you actually did, and what they left you. See §1A.
- [`CHANGE_PO_WITHOUT_BOM.md`](./CHANGE_PO_WITHOUT_BOM.md) — the one client flow change
  (a PO may be raised with no BOM, for buffer stock). Already implemented. Its three
  open risks became D1–D3 in `DECISIONS.md`.
- Approved designs: `MIS-ArjunBhaskar/BPP-MIS-UI-Screenshots/screens/` — `R1-Owner.png`
  … `R5` per-role homes, `P1`–`P5` pattern screens, `K1`–`K2` kiosk, `01`–`10`
  foundations. **A front-end phase that does not open the relevant screenshot is not
  done.** This is the exact failure that caused the first round of rework.

---

## 1A. The Phase Contract — mandatory, every phase, no exceptions

This is the loop that keeps the guide true. A phase that skips it leaves the next session
to rediscover what this one already learned, which is the single most expensive thing that
can happen to this project. **Every phase prompt in §5 and §6 repeats it**, and every phase
section points back here.

**Recording new policy decisions.** If you make a choice the guide and DECISIONS.md did not
specify — a new permission, who may see or edit something, a default that changes behaviour —
do not simply implement it and report "no decisions applied". Add it to `DECISIONS.md` as the
next free D-number, with the same columns as D1-D5: question, ASSUMED value, rationale, what
depends on it, how to change it, and the one-line question to put to Arjun. An unrecorded
policy choice is how a product acquires rules nobody agreed to.

### A. FIRST task — before any work at all

Before reading a ticket, before opening the spec, before writing a line:

1. Read **this phase's section** in §5 or §6, top to bottom. If it carries a
   `⚠ UPDATED BY PHASE N` stamp, that stamp is an instruction from an earlier phase and it
   overrides whatever the section said before it.
2. Read the **tail** of [`PHASE_LOG.md`](./PHASE_LOG.md) — the last two or three rows, not
   the whole file.
3. Read the **previous phase's report** at `phase-reports/phase-NN.md` (`NN` = your phase
   number minus one, zero-padded). If it is missing, say so in your report and carry on —
   a missing report is a fact worth recording, not a reason to stop.
4. **Apply anything marked pending.** The previous report's *Pending* section and the last
   log row's *Pending for next phase* cell are work you have inherited. Do it **before**
   your own tickets, not after. If you cannot, say which and why — do not quietly drop it.
5. If you need an assumed value, read it in [`DECISIONS.md`](./DECISIONS.md) and **cite the
   D-number**. Never copy the value into code comments, test names or this guide. If the
   value you need is not in `DECISIONS.md`, that is a new decision: stop and say so.

### B. LAST task — before reporting done

1. **Write `phase-reports/phase-NN.md`** — your own phase number, zero-padded, that exact
   filename. **Do not invent a filename.** The structure is in
   [`phase-reports/README.md`](./phase-reports/README.md). Cite `path:line`; never paste
   code into it.
2. **Append exactly one row to [`PHASE_LOG.md`](./PHASE_LOG.md).** One. Do not edit
   existing rows, do not reformat the table, do not add a column.
3. **If this phase discovered anything that changes a later phase, edit that later phase's
   section in this guide directly** — its Touches list, its acceptance check, its verify
   command, its prompt, whatever is now wrong — and stamp the change on its own line
   immediately under the phase heading:

   ```
   > ⚠ UPDATED BY PHASE 7 — the transition table forbids REWORK → SIGNED_OFF; MIS-165's
   > acceptance check below now names that case.
   ```

   A note in your report is **not** enough. The next agent reads the phase section; they
   may never open your report. Put the change where it will be read.

### C. Report to the human — **150 words or fewer**

Not 200. Not a summary of the guide — they have it open. It says: what was built, the
verify result, which of D1–D4 you relied on, anything you stamped onto a later phase, and
anything still pending. Then, as the last thing, **the exact file list to attach to the
next phase's session**, one path per line, so the human copies rather than decides.

### D. The contract is not optional and not negotiable

- A phase with no `phase-reports/phase-NN.md` is **not done**, whatever the code says.
- A phase that wrote a report but no `PHASE_LOG.md` row is **not done** — the next agent
  reads the log first and will never find the report.
- A phase that learned something about a later phase and did not stamp it is the exact
  failure this guide was written to prevent. Stamp it.

---

## 2. Hard constraints — the verification ceiling

These are facts about this machine, verified on 2026-09-15. They are not negotiable and
every phase below is written around them.

> ⚠ UPDATED BY PHASE 2 — the first two rows were wrong for a session running **on the Mac**.
> Phase 2 ran `pnpm vitest run` (386 tests, 57 files) and `pnpm build` (86/86 routes) in the
> agent shell. Both rows below are corrected. This matters most to **Phases 14–20**, which
> were all written around "agents write tests, you run them": an agent on the Mac should now
> run the tests it writes and report real results. The original rows still hold for a
> linux/arm64 sandbox, so check which shell you are in before assuming either way.

| Thing | Status | Consequence |
|---|---|---|
| `next build` | **Works on the Mac** (cannot run in a linux/arm64 sandbox) | Where it runs, it is the **acceptance gate** — it catches server/client boundary, Decimal serialisation and route errors `tsc` cannot. In a sandbox it fails on SWC binaries; build on the Mac instead. |
| `vitest` | **Works on the Mac** (cannot run in a linux/arm64 sandbox) | Run the tests you write and report the real result. In a sandbox the rolldown binding is missing — there, write tests and hand them to the human. |
| `prisma generate` / `prisma migrate` | **Cannot run** in the agent shell | Engine download returns 403. See the schema gate below. |
| `npm` / `pnpm install` | **Cannot run** | No new dependencies, ever. Build with what is in `package.json`. |
| `tsc --noEmit` | **Works** | This is the agent's primary gate. |
| `eslint` | **Works** | Secondary gate. |

**Every one of those failures has a literal error message, and they are all in §2A** —
what the text means, why it happens, and what to do instead. Read §2A before asking anyone
why something is erroring.

### 2.1 The agent's verify command

From `Arjun/app`, an agent finishes a ticket by running:

```bash
node_modules/.bin/tsc --noEmit --skipLibCheck
```

**It must print nothing.** `prisma/seed-demo.ts` has pre-existing errors that are
filtered out — they are not yours, never "fix" them, never touch that file.

Then, on the files it touched:

```bash
node_modules/.bin/eslint src/server/mis/<file>.ts src/components/mis/<area>/<file>.tsx
```

**Also nothing.**

### 2.2 Your verify command (VS Code terminal, on the Mac)

The agent cannot run these. You run them after the phase reports done:

```bash
cd Arjun/app
pnpm vitest run src/<the test files the phase added>
pnpm build            # the real compile gate — only you can run it
```

If `pnpm build` fails on a phase's work, that phase is not done. Reopen it.

### 2.3 The schema gate

Any phase that adds a Prisma model runs in **two halves**, because the agent cannot
regenerate the Prisma client, so code referencing a new model will not typecheck until
you regenerate it on your Mac.

- **Half A (agent):** edit `prisma/schema.prisma`, and hand-write the migration SQL into
  `prisma/migrations-pending/<timestamp>_<name>/migration.sql` with a rollback section.
  Follow the convention already set by `20260915000000_mis_po_purpose`. **No TypeScript
  that references the new model yet.** Verify: `tsc` still clean.
- **Gate (you, VS Code terminal):**
  ```bash
  cd Arjun/app
  mv prisma/migrations-pending/<name> prisma/migrations/<name>
  pnpm db:deploy && pnpm db:generate
  ```
- **Half B (agent, new session):** now write the server module and the screen against
  the regenerated client.

Phases that need this say **SCHEMA GATE** in their header: **1, 4, 6, 7, 8, 9, 10, 12, 13, 24, 25**.

> ⚠ UPDATED BY PHASE 24 — **24 and 25 were missing from this list.** Phase 24 adds
> `MisDashboardWidget` (D2 stores a layout as rows, not a JSON blob) and Phase 25 needs a
> payroll-period snapshot (D27). Neither header said SCHEMA GATE, so both would have been
> started as one session and stalled on a client that cannot compile. If a phase's design
> implies a table, it is a schema gate whatever its header says.
Treat Half A and Half B as two sessions. It is cheaper than one session that fails to
compile for an hour. The full procedure is the `mis-schema-gate` skill in
`app/.claude/skills/` — VS Code Claude Code loads it on its own; you do not paste it. The
403 you get if you try to run `prisma generate` here is §2A.2.

### 2.4 Rules no phase may break

- **Wages and salary are OWNER-only.** They never render on another role's screen, never
  enter an export another role can trigger, and **never go into a `before`/`after` audit
  payload**. Every check agent hunts for this specifically.
- `Input` has **no `type` prop** — use `NumberInput` / `DateInput` / `TimeInput`.
- `mis_employees.updated_at` is NOT NULL with no default — always pass it on raw SQL.
- Item codes use `-`, not `/` (`BPP-CUS-013`) — `/` breaks URL encoding.
- A `'use client'` file **never** imports from `src/server/mis/**` by value. Shared logic
  goes in `src/lib/mis/` (see `po-purpose.ts` for the pattern).
- Prisma `Decimal` never crosses into a client component — convert to `number` or
  `string` on the server boundary.
- Every exported server function starts with `requirePermission(...)` and logs mutations
  with `logAuditEvent(...)`. Every page starts with `requireMisAccess()`.

---

## 2A. Known errors — what they mean and what to do

**Read this before asking anyone why something is erroring.** Every entry below is a
failure this project has already produced. Each gives the literal text, the cause in one
sentence, and the fix. If your error is in this list, it is *expected* and it is *not a
bug in your work* — do the fix and move on.

If your error is **not** in this list, add it here when you solve it. That is cheaper than
the next person paying to ask the same question.

### 2A.1 `next build` / `pnpm build` in the agent shell

```
Failed to load SWC binary for linux/arm64, see more info here:
https://nextjs.org/docs/messages/failed-loading-swc
```

**Cause.** `node_modules` was installed on a Mac, so the native SWC binary in it is a
macOS binary and the agent shell is linux/arm64.

**Fix.** **Build on the Mac, never in the sandbox.** `pnpm build` is the human's command
(§2.2). There is nothing to repair — do not reinstall, do not add a dependency, do not
"fix" the lockfile. An agent that tries to make `next build` work here will burn a session
and change nothing. Note also that `pnpm build` runs `pnpm db:generate` first, so in the
sandbox it actually fails at 2A.2 below, one step earlier.

### 2A.2 `prisma generate` or `prisma migrate` returns 403

```
Error: Failed to fetch sha256 checksum at
https://binaries.prisma.sh/all_commits/<hash>/debian-openssl-3.0.x/libquery_engine.so.node.sha256
- 403 Forbidden
```

**Cause.** The sandbox's network is allow-listed and Prisma's engine CDN is not on it, so
the engine download is refused.

**Fix.** **Run it on the Mac.** This is the whole reason the **schema gate** exists (§2.3,
and the `mis-schema-gate` skill): the agent writes `schema.prisma` plus hand-written SQL
under `prisma/migrations-pending/`, stops, and the human runs
`pnpm db:deploy && pnpm db:generate`. Never work around it with `any`, a raw query, or a
hand-written type for a model the client does not know about yet.

### 2A.3 `vitest` cannot start

```
Error: Cannot find module './rolldown-binding.linux-arm64-gnu.node'
Failed to load native binding
```

**Cause.** Same as 2A.1 — the installed rolldown binding is the macOS one.

**Fix.** **Agents write tests in-session; the human runs them on the Mac** with
`pnpm vitest run <path>`. A phase that writes tests finishes by *naming the files to run*,
not by running them. A QA phase is not done until the human has run them and they pass.

### 2A.4 `tsc` complains about `prisma/seed-demo.ts`

```
prisma/seed-demo.ts(412,11): error TS2353: Object literal may only specify known
properties, and 'xyz' does not exist in type '...'
```

**Cause.** Pre-existing errors in a demo seed script. They predate this plan and are
nobody's current work.

**Fix.** **Always filter them, never fix them, never open the file.**

```bash
node_modules/.bin/tsc --noEmit --skipLibCheck
```

That command **must print nothing**. If it prints nothing, the types are fine — do not
re-read files to be sure (§7 rule 9). "Fixing" `seed-demo.ts` is out of scope in every
phase of this plan.

### 2A.5 A Prisma `Decimal` reached a client component

```
Error: Only plain objects, and a few built-ins, can be passed to Client Components
from Server Components. Classes or null prototypes are not supported.
```

**Cause.** A Prisma `Decimal` (or a `Date` inside a class-y wrapper) crossed the
server→client boundary. `Decimal` is a class instance and React cannot serialise it.

**Fix.** **Convert on the server, in the server function, before returning** — not in the
component:

```ts
return rows.map((r) => ({ ...r, amount: r.amount.toNumber() }));   // or .toString()
```

Use `.toNumber()` for arithmetic the UI does, `.toString()` for money you only display.
Doing the conversion in the component is not a fix — the value has to be serialisable to
*get* to the component.

### 2A.6 A `'use client'` file imported a server module

```
Error: This module cannot be imported from a Client Component module.
It should only be used from a Server Component.
```
or, in the same situation:
```
Module not found: Can't resolve 'fs'
```

**Cause.** A file marked `'use client'` imported something from `src/server/mis/**` **by
value**, dragging Prisma and Node built-ins into the browser bundle.

**Fix.** Two legitimate routes, and one that is always wrong:

- **Type-only imports are fine** — `import type { X } from '@/server/mis/orders'` is
  erased at compile time and does not bundle anything. Add the `type` keyword.
- **Shared runtime logic moves to `src/lib/mis/`**, which is client-safe by construction.
  `src/lib/mis/po-purpose.ts` and `src/lib/mis/permissions.ts` are the pattern.
- **Never** re-export a server function through a barrel file to dodge the error. It does
  not dodge it; it just moves where it explodes.

### 2A.7 `MisForbiddenError`

```
MisForbiddenError: Not permitted: wages.read
MisForbiddenError: Not permitted: store.count on item:BPP-CUS-013
```

**Cause.** `requirePermission(action)` was called with an action the current role does not
hold — or, just as often, with the **wrong action string** for what the function actually
does.

**Fix.** Open `src/lib/mis/permissions.ts`, find the action in `MIS_ACTIONS`, and check the
role's row in `MATRIX`. Then:

- **If the role genuinely should not do this** — that is the system working. Fix the
  *screen* so the surface is absent for that role (`MIS_UI_SPEC.md` §4.5), not the matrix.
- **If the action string is wrong** — e.g. guarding a read with `settings.write` — correct
  the call.
- **Never widen `MATRIX` to make an error go away.** A new grant is a decision. Escalate
  it; do not grant it. `wages.read` is **OWNER-only, always** — if a non-OWNER path needs a
  wage, the path is wrong, not the matrix. See the `mis-permission-matrix` skill.

### 2A.8 A page 404s

```
404 | This page could not be found.
```

**Cause, nearly always one of three.** (a) The MIS home is at **`/mis`**, not
`/mis/dashboard` — `src/app/(mis)/mis/dashboard/page.tsx` exists only as a `redirect()`
shim for the address people keep bookmarking, so do not treat it as the real home or add
content to it. (b) A new page was created outside the route group: pages live at
`src/app/(mis)/mis/<route>/page.tsx`, and `(mis)` is a route **group** — it is not part of
the URL. (c) The URL contains an item code with a `/` in it.

**Fix.** Put the file at `src/app/(mis)/mis/<route>/page.tsx`. Link to `/mis` for home.
And keep item codes on `-`, never `/` (`BPP-CUS-013`) — a `/` becomes a path separator and
the route falls through. See 2A.10.

### 2A.9 `Property 'type' does not exist` on `Input`

```
error TS2322: Type '{ type: string; ... }' is not assignable to type 'InputProps'.
  Property 'type' does not exist on type 'InputProps'.
```

**Cause.** The kit's `Input` deliberately has **no `type` prop**.

**Fix.** Use the purpose-built atom: `NumberInput`, `DateInput`, `TimeInput` from
`src/components/mis/kit/`. Do not add a `type` prop to `Input` to make this compile.

### 2A.10 Two database/data errors that look like bugs and are not

```
null value in column "updated_at" of relation "mis_employees"
violates not-null constraint
```
`mis_employees.updated_at` is NOT NULL **with no default** — pass it explicitly on every
raw SQL insert.

```
error TS2353: Object literal may only specify known properties,
and 'details' does not exist in type 'AuditEventInput'
```
`logAuditEvent` has **no `details` field**. The shape is
`{ actorId, entity, entityId, action, before?, after? }` (`MIS_UI_SPEC.md` §2). And
remember §2.4: **no wage or salary figure goes into `before`/`after`.**

### 2A.11 `Module not found: Can't resolve '@prisma/client'`

**Cause.** Prisma enums were imported from the wrong path.

**Fix.** `import { MisItemUnit } from '@/generated/prisma/enums'` — the generated enums
path is client-safe. A client component imports the **enum**, never the Prisma client.

### 2A.12 Anything that wants a new dependency

```
ERR_PNPM_NO_OFFLINE_META  /  npm ERR! network request to https://registry.npmjs.org/... failed
```

**Cause.** `npm` / `pnpm install` cannot run here, by design.

**Fix.** **No new dependencies, ever** (§2). Build with what is in `package.json`. If a
phase seems to need a library, it does not — say so and escalate rather than adding one.

### 2A.13 `timeout exceeded when trying to connect`

```
Error: timeout exceeded when trying to connect
    at getStockBalance …
```

**Cause.** The runtime pool is deliberately ONE connection (`createPoolConfig`, `max: 1`, `connectionTimeoutMillis: 10000`). A page that runs one query per row (`items.map(async (i) => db…findFirst(i))` over 176 items) puts them all in one queue, and the last one waits longer than the connect timeout. It is not a connection problem and raising `max` is not the fix.

**Fix.** One query for the whole set — `SELECT DISTINCT ON (item_id) …` (see `getStockBalances` in `server/mis/store.ts`), a `findMany` with `in`, or a `groupBy` — then look each row up in a `Map`. `store-pool.test.ts` shows how to test it: count the queries against a fake database. Found by opening `/mis/store` in a browser (F-24); no unit test had caught it because the tests' fake database has no pool.

---

### P3006 / P3018 — `schema "auth" does not exist` when applying a migration

```
Migration `20260914000000_mis_attendance_bom_schema` failed to apply cleanly to the
shadow database. Database error code: 3F000 — ERROR: schema "auth" does not exist
```

**Cause.** `pnpm db:migrate` is `prisma migrate dev`, which replays the whole migration
history into a throwaway *shadow database*. That shadow DB is bare Postgres with no Supabase
`auth` schema, so the `mis_documents.uploaded_by → auth.users` foreign key cannot be created
there. Your real database and your new migration are both fine.

**Fix.** Use `pnpm db:deploy && pnpm db:generate` (added to package.json as
`prisma migrate deploy`). It uses no shadow database and applies only pending migrations.
**Every SCHEMA GATE phase uses `db:deploy`.** Never edit the Sept-14 migration to work around
this — it is already applied and Prisma checksums applied migrations.

### `pnpm build` fails on `prisma/seed-demo.ts` while `tsc` looks clean

```
./prisma/seed-demo.ts:312:7
Type error: Type '"RECEIVED"' is not assignable to type 'MisPoStatus | undefined'.
```

**Cause.** `tsconfig.json` excluded only `prisma/seed.ts`, so `next build` still type-checked
the other prisma scripts. `seed-demo.ts` has 10 errors from schema drift. The old advice to
filter `tsc` output with `grep -v seed-demo` hid this from every phase until the first real
build ran.

**Fixed in Phase 1.** `tsconfig.json` now excludes `prisma/**`. As of that change the verify
command is plain — **no grep filter** — and must be silent:

```
node_modules/.bin/tsc --noEmit --skipLibCheck
```

If a later phase sees seed-demo errors again, someone widened `include` or narrowed
`exclude`; fix that rather than re-adding the filter.

## 3. Decisions — all four are ASSUMED, and they live in one file

**The decisions themselves are in [`DECISIONS.md`](./DECISIONS.md), not here.** That file
is the single editable registry: each decision's question, the value we are building on,
why, every file and Jira ticket that depends on it, and the exact line telling you which
phases to re-run if Arjun answers differently.

**The rule this buys us.** A phase **cites a D-number**; it never restates the value. So
changing a decision later is an edit to one row in one file plus a named re-run — not a
hunt through twenty-two phase sections for a number someone hard-coded. If you find a
phase below that states a value instead of citing its D-number, that is a defect in this
guide: fix it.

| # | The question, in four words | Assumed answer, in one line | Phases that cite it |
|---|---|---|---|
| **D1** | Buffer-stock costing | Buffer POs post to a general inventory pool; an order's material cost is recognised **at issue**, not at purchase | 20, 21 |
| **D2** | BOM-less PO approval | **Identical** monetary thresholds to order-linked POs; no special rule | 21 |
| **D3** | What "PO" means | "PO" = the **supplier** PO we raise; the customer's is **"Customer PO"**, a reference on the Order. E5 tickets mean Customer PO | 16, 21 |
| **D4** | Hierarchy & pool visibility | **3 levels** (Owner → Admin/Supervisor → Worker); each user sees **their own subtree only**; Admin sees Workers and Supervisors but **not** other Admins or the Owner; filtered **in the query**, never in the client | 2, 8, 14, 20 |

All four are **ASSUMED — awaiting Arjun**. D4 carries higher confidence than the others
because it has design evidence behind it (the R4-Admin design note and `MIS_UI_SPEC.md`
§4.5), not only reasoning; `DECISIONS.md` sets out that evidence.

**No phase is blocked any more.** Earlier drafts of this guide held Phases 2 and 21 until
Arjun replied. He has chosen defaults instead, so every phase builds on its D-value and
cites it. If an answer comes back different, the cost is a re-run of the phases named in
that decision's row — which is why the row names them.

**When an answer arrives:** edit the **Value** and **Status** cells of that one row in
`DECISIONS.md`, then run the phases in its *To change this* line. Nothing in this guide
needs touching. The four messages to send Arjun are at the bottom of `DECISIONS.md`,
written so a one-word reply is enough.

## 4. Phase index

22 phases. 38 build tickets, 54 QA tickets, plus the board itself. Phases 1–13 are
ordered so that each one unblocks the ones after it; the QA phases (14–20) can then run
in any order, or in parallel by a second person.

| # | Phase | Epic | Tickets | Model | Done |
|---|---|---|---|---|---|
| 0 | Jira board truth-up | all | board only | haiku | ☐ |
| 1 | Wage types & the code system 🔒 | E1 | MIS-9, MIS-44, MIS-45 | sonnet | ☐ |
| 2 | Pool visibility resolver | E1 | MIS-10, MIS-47, MIS-48 | **opus** (D4) | ☐ |
| 3 | MIS user management & invites | E1 | MIS-11, MIS-50, MIS-51 | sonnet | ☐ |
| 4 | Defect type master + AQL severity | E2 | MIS-19, MIS-69, MIS-70 | haiku | ☐ |
| 5 | AQL engine & thresholds 🔒 | E7 | MIS-175, MIS-194, MIS-195 | sonnet | ☐ |
| 6 | Line clearance | E6 | MIS-137, MIS-148, MIS-149 | sonnet | ☐ |
| 7 | Phase sign-off & handover gate | E6 | MIS-142, MIS-163, MIS-164 | **opus** | ☐ |
| 8 | Worker allocation | E4 | MIS-260, MIS-262, MIS-263 | sonnet | ☐ |
| 9 | Wire allocations to job cards | E4 | MIS-261, MIS-265 | sonnet | ☐ |
| 10 | Offline write queue (the infra) | E8 | MIS-25, MIS-85, MIS-86 | **opus** | ☐ |
| 11 | Offline production entry | E6 | MIS-139, MIS-154, MIS-155 | sonnet | ☐ |
| 12 | Kiosk device enrolment & pull | E3 | MIS-225, MIS-243, MIS-244 | sonnet | ☐ |
| 13 | Kiosk punch ingestion & sync | E3 | MIS-224, MIS-240, MIS-241 | sonnet | ☐ |
| 14 | QA · access, roles & money leaks | E1 | MIS-34, MIS-40, MIS-43, MIS-46, MIS-49, MIS-52, MIS-272 | sonnet | ☐ |
| 15 | QA · masters, import & fixtures | E2/E8 | MIS-66, MIS-75, MIS-91 | haiku | ☐ |
| 16 | QA · orders, BOM & job cards | E5 | MIS-111 → MIS-134 (9) | haiku | ☐ |
| 17 | QA · production & wastage | E6 | MIS-147 → MIS-170 (9) | haiku | ☐ |
| 18 | QA · quality, COA, docs & reports | E7 | MIS-187 → MIS-267 (11) | haiku | ☐ |
| 19 | QA · attendance, kiosk & payroll | E3 | MIS-234 → MIS-259 (6) | haiku | ☐ |
| 20 | QA · store/PO, scheduling & platform | E9/E4/E8 | MIS-279, MIS-98, MIS-264, MIS-266, MIS-81, MIS-84, MIS-87, MIS-89, MIS-93 | haiku | ☐ |
| 21 | PO decisions — conditional | E9 | MIS-275, MIS-295 | **opus** | ☐ |
| 22 | Unclaimed gaps (22.1–22.3) | E4/E8 | three tickets to be created first — see the section | sonnet | ☐ |
| 23 | Parked-writes inbox | E8 | no ticket yet — see Appendix B §B.7 | sonnet | ☐ |
| 24 | Desktop layer (D1–D14) | — | none yet — see the section | opus → sonnet | ☐ |

🔒 = touches Owner-only money. The check agent runs an extra wage-leak sweep on these.

**Phase 23 was added by Phase 10** (it was numbered 22 until Phase 11 found a second Phase 22 and the human renumbered it). The offline contract parks writes that were legal when
queued and illegal on arrival, and nothing in phases 0–21 owned the screen where a human
reviews them. A queue with no inbox is a silent drop with extra steps, so the screen is now
a named phase rather than an assumption.

**Every phase writes `docs/phase-reports/phase-NN.md` and one row in
[`PHASE_LOG.md`](./PHASE_LOG.md)** — that is §1A, the Phase Contract, and a phase without
them is not done. Tick the **Done** box here only after the verify command passed *and* the
report exists. `PHASE_LOG.md` is the machine-readable version of this table; if the two ever
disagree, the log is right, because a phase wrote it and a human ticked this.

**Nothing in this plan is blocked on Arjun any more.** D1–D4 are ASSUMED with recorded
values in [`DECISIONS.md`](./DECISIONS.md); Phases 2 and 21 build on them and cite them.

**Model policy in one line:** `haiku` for anything where the answer is already written
down (board edits, masters that copy an existing pattern, tests written against a matrix
this guide supplies); `sonnet` for normal build work that follows `MIS_UI_SPEC.md`;
`opus` for the four phases where the shape of the thing is genuinely undecided —
hierarchy semantics (2), a state machine nobody has specified (7), offline
conflict resolution (10), and whatever Arjun answers in §3 (21). If a `sonnet` phase
turns out to need a design decision, **stop and escalate rather than guessing** — a
guess here is what rework is made of.

---

## 5. The phases

---

### Phase 0 · Jira board truth-up

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A. You are the first phase, so there is no previous
> report and `PHASE_LOG.md` is empty — record that fact and carry on.
> _Last task:_ write [`phase-reports/phase-00.md`](./phase-reports/phase-00.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 0 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** Make the Jira board say what the codebase says, so that from here on "done"
means something.

**Tickets.** No code tickets. Operates on all 294 issues.

**Why first.** Every one of the 294 issues is still `To Do`, including ~200 whose feature
shipped months ago. Nobody — not Arjun, not you — can plan against that board. It also
costs nothing to fix and it makes every later phase's "mark it Done" step meaningful.

**Touches.** Jira only (Atlassian MCP). No repo files except this guide's tick-boxes.

**Model.** `haiku`. This is data entry against a table that already exists in
`TICKET_INVENTORY.md`. There is no judgement in it.

**What to do.**

1. **Bulk status correction.** Read the per-epic tables in `TICKET_INVENTORY.md`. For each
   non-epic issue, transition it by its `built?` column:
   - `YES` → **Done**
   - `PARTIAL` → **In Progress**, and add a comment quoting that row's `notes` column
     verbatim, so the gap is on the ticket and not only in a doc.
   - `NO` → leave as **To Do**.
   Use `getTransitionsForJiraIssue` once per issue *type* to learn the transition ids,
   then `transitionJiraIssue` in batches. Do not invent statuses — use whatever the
   project's workflow actually exposes.
2. **Set the epic rollups** (MIS-1, MIS-2, MIS-3, MIS-94, MIS-99, MIS-135, MIS-171,
   MIS-220) to **In Progress**. All eight are PARTIAL at rollup.
3. **Parent the orphans.** MIS-273 → MIS-294 are typed `Task` and have no `parent` link,
   so they sit outside the Epic→Story→Subtask hierarchy entirely. MIS-273 is acting as the
   E9 epic marker but is a Task. Either convert MIS-273 to an Epic and parent
   MIS-274 → MIS-294 to it, or — if the project's scheme forbids converting issue types —
   create a real Epic "E9 · Purchase Orders, GRN & Store Inventory", parent all 22 to it,
   and close MIS-273 as superseded. Parent MIS-295 to the same epic.
4. **MIS-280 → MIS-294 — the evidence sweep.** These fifteen tickets duplicate E9
   Store/PO scope that is already built. Arjun wants each one **verified against the code**
   before it is closed — but cheaply. So: **one sweep, no test runs, no `pnpm` anything, no
   judgement.** Run the block below exactly as written, from `Arjun/app`. It checks three
   legs per ticket — does the **route** exist, does the **component** exist, does the
   **server function** exist — and prints a verdict per row.

   ```bash
   cd Arjun/app
   printf '%-8s %-8s %-10s %-10s %s\n' TICKET ROUTE COMPONENT SERVER-FN VERDICT | tee docs/E9_EVIDENCE_SWEEP.txt
   while IFS='|' read -r tkt p1 p2 sym; do
     [ -z "$tkt" ] && continue
     r=MISSING; c=MISSING; s=MISSING
     [ "$p1" != "-" ] && [ -e "$p1" ] && r=PRESENT
     [ "$p2" != "-" ] && [ -e "$p2" ] && c=PRESENT
     [ "$sym" != "-" ] && grep -rqE "$sym" src/server/mis src/lib/mis src/app/api/mis prisma/schema.prisma 2>/dev/null && s=PRESENT
     v=OPEN; [ "$r$c$s" = "PRESENTPRESENTPRESENT" ] && v=DUPLICATE
     printf '%-8s %-8s %-10s %-10s %s\n' "$tkt" "$r" "$c" "$s" "$v"
   done <<'ROWS' | tee -a docs/E9_EVIDENCE_SWEEP.txt
   MIS-280|prisma/schema.prisma|src/components/mis/items/item-screen.tsx|model MisItem
   MIS-281|src/app/(mis)/mis/masters/items/page.tsx|src/components/mis/items/item-screen.tsx|searchItems
   MIS-282|src/app/(mis)/mis/masters/items/page.tsx|src/components/mis/items/item-screen.tsx|updateItem
   MIS-283|src/app/(mis)/mis/masters/items/page.tsx|src/components/mis/items/item-screen.tsx|deleteItem
   MIS-284|prisma/seed-demo.ts|-|-
   MIS-285|src/app/(mis)/mis/audit/page.tsx|src/components/mis/audit|logAuditEvent
   MIS-286|src/app/api/mis/inventory/import/route.ts|src/app/api/mis/inventory/template/route.ts|duplicate
   MIS-287|src/lib/mis/permissions.ts|src/lib/mis/roles.ts|STORE_GUY
   MIS-288|src/app/(mis)/mis/store/receive/page.tsx|src/components/mis/store/receive-screen.tsx|commitReceipt
   MIS-289|src/app/(mis)/mis/store/issue/page.tsx|src/components/mis/store/issue-screen.tsx|commitIssue
   MIS-290|src/app/(mis)/mis/store/stock/page.tsx|src/components/mis/store/store-stock-screen.tsx|listStockSummary
   MIS-291|src/app/(mis)/mis/store/count/page.tsx|src/components/mis/store/store-count-screen.tsx|recordPhysicalCount
   MIS-292|src/app/(mis)/mis/store/count/page.tsx|src/components/mis/store/store-count-screen.tsx|discrepanc
   MIS-293|src/app/(mis)/mis/store/dashboard/page.tsx|src/components/mis/store/store-dashboard-screen.tsx|reorderLevel
   MIS-294|src/app/(mis)/mis/reports/page.tsx|src/components/mis/reports|weekly
   ROWS
   ```

   **That is the entire investigation.** Do not open the files. Do not run `tsc`, `vitest`
   or `pnpm build`. Do not "confirm" a PRESENT by reading the code — the sweep *is* the
   confirmation, and re-reading is what makes this phase expensive.

   **Then apply these three rules, in this order, to every row:**

   1. **`DUPLICATE` (all three PRESENT) → close the ticket as Duplicate**, linked to the
      E9 ticket it duplicates or to the shipped work. The link targets are fixed:

      | Sweep row | Link the duplicate to |
      |---|---|
      | MIS-280, MIS-281, MIS-282, MIS-283, MIS-285, MIS-286 | **MIS-274** (E9-01 · inventory item master, STORE role, migration) |
      | MIS-287 | **MIS-274** (`STORE_GUY` is part of that ticket's shipped scope) |
      | MIS-288, MIS-289, MIS-290, MIS-291, MIS-293 | **MIS-277** (E9-04 · store dashboard and cart-style GRN verify) |

   2. **`OPEN` (any leg MISSING) → leave it open**, comment the sweep row on it verbatim
      (`ROUTE PRESENT / COMPONENT MISSING / SERVER-FN MISSING`), and move it into the phase
      that will finish it: **MIS-284 → Phase 15** (masters / import / fixtures — it is a
      seed-data count), **MIS-294 → Phase 20** (store & platform QA — the missing piece is
      the weekly cadence).
   3. **Override — a `PARTIAL` in `TICKET_INVENTORY.md` always wins.** If the sweep says
      `DUPLICATE` but the inventory's `built?` column says `PARTIAL`, **the ticket stays
      open**: the sweep can only prove a thing exists, never that it is finished. Comment
      both the sweep row and the inventory `notes` on the ticket. **This affects MIS-292**
      (a discrepancy string exists in `store.ts`, but the inventory records no confirmed
      discrepancy engine) — so MIS-292 stays open and joins **Phase 20**.

   Expect roughly **twelve closed as duplicate** and **three left open** (MIS-284,
   MIS-292, MIS-294). If your counts differ, that is fine — report the numbers, do not
   force them to match. Commit `docs/E9_EVIDENCE_SWEEP.txt`; it is the evidence Arjun
   asked for and it is the whole justification for the closures.
5. **Write nothing new to disk** except two files: `docs/JIRA_TRUTH_UP.md` — one line per
   issue changed, old status → new status, plus the list of issues closed as duplicate —
   and `docs/E9_EVIDENCE_SWEEP.txt` from step 4. (The Phase Contract's
   `docs/phase-reports/phase-00.md` and the `PHASE_LOG.md` row are on top of that, and are
   not optional.)

**Acceptance check.**
- A JQL of `project = MIS AND status = "To Do"` returns ~92 issues, not 294.
- No issue in MIS-273 → MIS-295 lacks a parent.
- `docs/JIRA_TRUTH_UP.md` exists and its line count matches the number of transitions
  performed.
- `docs/E9_EVIDENCE_SWEEP.txt` exists and has **16 lines** — a header plus one row for each
  of MIS-280 → MIS-294. Every row closed as Duplicate reads `PRESENT PRESENT PRESENT`.
- Every ticket left open from that sweep carries a comment with its sweep row, and has been
  named into a later phase.
- `docs/phase-reports/phase-00.md` exists and `PHASE_LOG.md` has exactly one row.

**Verify.** Jira-side, not code-side:
```
searchJiraIssuesUsingJql: project = MIS AND status = "To Do"        → ~92
searchJiraIssuesUsingJql: project = MIS AND parent IS EMPTY AND type != Epic  → 0
```

**Prompt.**
```
run phase 0 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Use model haiku. Read Arjun/app/docs/TICKET_INVENTORY.md for the built? verdicts — that
file is the source of truth for statuses, do not re-check the codebase. Use the Atlassian
MCP tools. Batch transitions; do not fetch issues one at a time to "confirm" them.

For MIS-280 to MIS-294 only, run step 4's evidence sweep block exactly as written in the
guide — it is one paste-and-run shell block. Do not open the source files, do not run tsc,
vitest or pnpm build, and do not re-verify a PRESENT by reading code. Close a ticket as
Duplicate only when all three legs are PRESENT and TICKET_INVENTORY.md does not say
PARTIAL; everything else stays open with its sweep row commented on it.

Write Arjun/app/docs/JIRA_TRUTH_UP.md and Arjun/app/docs/E9_EVIDENCE_SWEEP.txt.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A and this
phase's section. You are the first phase: Arjun/app/docs/PHASE_LOG.md is empty and there is
no previous phase report, so there is nothing pending to inherit. LAST: write
Arjun/app/docs/phase-reports/phase-00.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 0 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 1 · Wage types & the code system 🔒 — **SCHEMA GATE**

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-00.md`](./phase-reports/phase-00.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-01.md`](./phase-reports/phase-01.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 1 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** Replace the single flat `DAILY_WAGE_DEFAULT` rule with a real wage-type master
that only the Owner can see or touch, and give every type a code so other screens can
reference a wage without displaying a rupee figure.

**Tickets.** MIS-9 (E1-06 story), MIS-44 (BE · model + code generator + the two special
types), MIS-45 (FE · Owner-only wage screen and code-only pickers). Epic **E1 ·
Foundation & Access Control**.

**Why here.** Payroll (`E3-11`, built) currently computes from one flat rule. Every later
money surface — BOM costing (E5-04, PARTIAL), payroll export, the Owner dashboard card —
reads from whatever this phase establishes. Getting it wrong later means touching all of
them again.

**Touches.**
- `prisma/schema.prisma` — new `MisWageType` model (`code`, `name`, `amount Decimal`,
  `unit`, `effectiveFrom`, `isActive`, `deletedAt`), mapped `mis_wage_types`.
- `prisma/migrations-pending/<ts>_mis_wage_types/migration.sql`
- `src/server/mis/payroll.ts` — read wage by type instead of the flat rule
- `src/server/mis/wage-type.ts` — **new**, Owner-gated CRUD + code generator
- `src/lib/mis/wage-code.ts` — **new**, pure code formatter, client-safe
- `src/components/mis/payroll/wage-type-screen.tsx` — **new**, Owner-only
- `src/app/(mis)/mis/settings/wages/page.tsx` + `actions.ts`

**Model.** `sonnet`. The shape is decided (it mirrors the existing master pattern in
`src/server/mis/master-option.ts` and `department.ts`); what makes it more than haiku work
is the Owner-only gating threaded through payroll, which needs care rather than
invention.

**Acceptance check.**
- `getMisRole()` anything other than `OWNER` calling any export of `wage-type.ts` throws
  `MisForbiddenError`. There is a test for each of the other seven roles.
- The wage screen is reachable only from the Owner's Settings tab; it is **absent** from
  every other role's navigation, not greyed out (MIS_UI_SPEC §4.4 rule 4).
- The code-only picker used elsewhere renders `WG-DAILY-01` and never an amount.
- `logAuditEvent` on a wage change records the code in `before`/`after`, **never the
  amount**. Grep the diff for `amount` inside an audit payload — must be zero hits.
- `calculateMonthlyPayroll` produces the same figure as before for an employee on the
  default daily wage (no silent number movement).

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck     # nothing
node_modules/.bin/eslint src/server/mis/wage-type.ts src/server/mis/payroll.ts src/lib/mis/wage-code.ts src/components/mis/payroll/wage-type-screen.tsx
# then, on your Mac:
pnpm vitest run src/server/mis/wage-type.test.ts
```

**Prompt.**
```
run phase 1 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

This is a SCHEMA GATE phase — do Half A only (schema.prisma + migrations-pending SQL,
no TypeScript referencing the new model). Stop and tell me to run pnpm db:deploy &&
pnpm db:generate. Then I will start a new session for Half B.

Read Arjun/app/docs/MIS_UI_SPEC.md first, especially §2 server conventions and the
wage/audit rule in §3. Do not explore the codebase beyond schema.prisma, the existing
migrations-pending example, and src/server/mis/payroll.ts.
Model: sonnet.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-00.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-01.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 1 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```
Half B prompt, in a fresh session after the migrate:
```
run phase 1 Half B from Arjun/app/docs/DEVELOPMENT_GUIDE.md

The MisWageType migration is applied and the Prisma client is regenerated.
Read Arjun/app/docs/MIS_UI_SPEC.md first. For each ticket in order — MIS-44, then
MIS-45 — run the mis-be-build / mis-fe-build agent, then the matching check agent on the
same ticket, and do not start the next ticket until the check returns PASS.
Wages are OWNER-only: they must not reach another role's screen or any audit payload.
Model: sonnet. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-00.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-01.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 1 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 2 · Hierarchy-aware pool visibility resolver — **implements D4**

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-01.md`](./phase-reports/phase-01.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-02.md`](./phase-reports/phase-02.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 2 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** One resolver that answers "which employees/machines/orders may this user see",
applied at query level, so every list in the app is scoped the same way instead of each
screen inventing its own filter.

**Tickets.** MIS-10 (E1-07 story), MIS-47 (BE · resolver + query-level scoping),
MIS-48 (FE · scoped pickers and honest empty states). Epic **E1**.

**Why here.** Phase 8 (worker allocation) cannot define "a supervisor's crew" without it,
and the QA phase 14 cross-role visibility tests test exactly this. Today the only
hierarchy that exists is a `managerId` self-relation on the employee model — there is no
resolver.

**Touches.**
- `src/server/mis/visibility.ts` — **new**, the resolver
- `src/server/mis/employee.ts`, `machines-board.ts`, `orders.ts`, `attendance.ts` — apply
  the resolver to list queries
- `src/components/mis/**` pickers — honest empty states ("No machines in your
  department", never a blank list)

**Decision.** This phase implements **D4** — read the value in
[`DECISIONS.md`](./DECISIONS.md) and cite it; do not restate it here or in code comments.
D4 is ASSUMED but carries the highest confidence of the four (it has design evidence behind
it). **This phase is no longer blocked** — build on the assumed value. The one part D4
leaves genuinely open is flagged there: can a worker sit in two supervisors' pools? The
assumed answer is no, so **write the resolver so that answering yes later is a change to
one function, not to every list** — return a `where` fragment, not a hard-coded parent id.

**Model.** **`opus`.** D4 fixes the semantics, but the *shape* is still real design work:
how the resolver composes into a Prisma `where` without an N+1, what happens to an employee
with no manager, how an empty pool differs from a permission denial, and how one resolver
serves employees, machines and orders without becoming three near-copies. Getting this
wrong means re-scoping every list in the app later.

**Acceptance check.**
- A single exported `resolveVisibleEmployeeIds(actor)` (and siblings for machine and
  order) that every list query composes into its `where`. No screen filters by hand.
- Visibility for every role is exactly what **D4** defines. Assert it against
  `DECISIONS.md` D4, not against a value retyped into a test. WORKER remains
  permission-less by design (MIS_UI_SPEC §2).
- The scope is applied in the Prisma `where`. **A `.filter()` in a client component is an
  automatic fail** — by then the rows have already been sent to the browser (D4).
- An empty pool renders `EmptyState` with a sentence naming *why* it is empty, not a
  zero-row table.
- No N+1: the resolver returns an id array or a Prisma `where` fragment, resolved once
  per request.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/visibility.ts src/server/mis/employee.ts src/server/mis/machines-board.ts src/server/mis/orders.ts
# on your Mac:
pnpm vitest run src/server/mis/visibility.test.ts
```

**Prompt.**
```
run phase 2 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Read Arjun/app/docs/DECISIONS.md D4 first — it is ASSUMED but decided, so build on it and
cite "D4" rather than restating the rule. Do not guess hierarchy semantics D4 does not
cover; if you need a value D4 does not give you, stop and say so.

Read Arjun/app/docs/MIS_UI_SPEC.md next. Design the resolver and write it down in the
phase's own words before coding, then implement MIS-47 and MIS-48 one at a time with the
mis-be-build / mis-fe-build agent and the matching checker after each.
Model: opus. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-01.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-02.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 2 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 3 · MIS user management & invites

> ⚠ UPDATED BY PHASE 3 — **manager assignment is now built.** `updateEmployee` accepts
> `managerId` (`src/server/mis/employee.ts`), guarded by
> `wouldCreateManagerCycle` (`src/server/mis/visibility.ts`) so nobody can be assigned as
> their own manager or as a descendant's manager. `employee-screen.tsx` has a "Reports to"
> picker drawn from the same (D4-scoped) list the screen already has — the person who edits
> the form can only assign a manager from among people they can already see. **A partially
> entered org chart still scopes everyone who was missed down to themselves** — that risk
> is unchanged, it is a data-entry discipline, not a code gap. D4's resolver
> (`visibility.ts`) is no longer dead code the moment the first link is saved.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-02.md`](./phase-reports/phase-02.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-03.md`](./phase-reports/phase-03.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 3 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** Let the Owner create MIS logins, assign a MIS role, and see how many of the 15
seats are used — without going through the existing workspace user admin.

**Tickets.** MIS-11 (E1-08 story), MIS-50 (BE · invite server module + seat-limit guard),
MIS-51 (FE · user list, invite form, seat counter). Epic **E1**.

**Why here.** It is the last unbuilt E1 item and it is independent of D4, so it is the
phase to run while waiting on Arjun.

**Touches.**
- `src/server/mis/users.ts` — **new**; reuse `src/server/auth/` invite plumbing rather
  than building a second invite system
- `src/server/mis/roles.ts` — assign `MisRole` on accept
- `src/components/mis/settings/users-screen.tsx` — **new**
- `src/app/(mis)/mis/settings/users/page.tsx` + `actions.ts`

**Model.** `sonnet`. Cheap model territory in principle, but it wires into existing
non-MIS auth code, and "reuse, don't duplicate" is a judgement a haiku pass tends to get
wrong by writing a parallel invite table.

**Acceptance check.**
- Invite is Owner-only; ADMIN may view the list but not invite (check the permission
  matrix in `src/lib/mis/permissions.ts` and follow it, do not extend it silently).
- Seat limit is enforced **server-side** at 15; the counter on screen is display only.
- Re-inviting an existing email does not create a second user.
- The screen follows MIS_UI_SPEC §4 — phone-width card stack, `max-w-[420px]`, `pb-24`,
  header card first. Compare against `R1-Owner.png`.
- Every mutation calls `logAuditEvent`.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/users.ts src/components/mis/settings/users-screen.tsx
# on your Mac:
pnpm vitest run src/server/mis/users.test.ts
```

**Prompt.**
```
run phase 3 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Read Arjun/app/docs/MIS_UI_SPEC.md first. Reuse the existing invite plumbing in
src/server/auth/ — do not build a second invite system or a second user table.
Do MIS-50 with mis-be-build then mis-be-check, then MIS-51 with mis-fe-build then
mis-fe-check. The FE agent must open BPP-MIS-UI-Screenshots/screens/R1-Owner.png.
Model: sonnet. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-02.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-03.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 3 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 4 · Defect type master with AQL severity — **SCHEMA GATE**

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-03.md`](./phase-reports/phase-03.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-04.md`](./phase-reports/phase-04.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 4 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** A master list of defect types, each carrying an AQL severity (Critical / Major /
Minor), so QC can log a named defect instead of free text.

**Tickets.** MIS-19 (E2-08, DATA), MIS-69 (BE · `MisDefectType` model + server module),
MIS-70 (FE · defect type screen with severity picker). Epic **E2 · Master Tables**.

**Why here.** Phase 5 (the AQL engine) cannot classify anything without severities. This
is the smallest, cheapest unblocker in the whole plan.

**Touches.**
- `prisma/schema.prisma` + `migrations-pending` — `MisDefectType` — **SCHEMA GATE**
- `src/server/mis/defect-type.ts` — **new**
- `src/components/mis/masters/defect-type-screen.tsx` — **new**
- `src/app/(mis)/mis/masters/defect-types/page.tsx`
- `src/server/mis/qc.ts` — point defect logging at the master

**Model.** `haiku`. This is a copy of an existing, working pattern: `department.ts` +
`department-screen.tsx`, or the generic `MasterTable` in
`src/components/mis/masters/master-table.tsx`. Nothing here is undecided. Do not spend a
`sonnet` on it.

**Acceptance check.**
- Uses the existing `<MasterTable/>` component — a bespoke table is a fail.
- Severity is an enum (`CRITICAL | MAJOR | MINOR`), not a free string.
- Soft delete via `deletedAt`; list queries filter `deletedAt: null`.
- A defect type in use cannot be hard-deleted.
- Screen matches `06-MasterTable.png` and `07-Slide-over-dialog.png`.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/defect-type.ts src/components/mis/masters/defect-type-screen.tsx
```

**Prompt.**
```
run phase 4 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

SCHEMA GATE phase — Half A is schema.prisma + migrations-pending SQL only; stop and tell
me to run pnpm db:deploy && pnpm db:generate before Half B.

Read Arjun/app/docs/MIS_UI_SPEC.md first. Copy the department master pattern
(src/server/mis/department.ts + components/mis/departments) exactly; use the existing
<MasterTable/> component. Do not design anything new.
Model: haiku. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-03.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-04.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 4 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 5 · AQL engine & configurable thresholds 🔒

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-04.md`](./phase-reports/phase-04.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-05.md`](./phase-reports/phase-05.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 5 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** Compute an accept/reject decision from a sample's defects and severity-weighted
thresholds that the Owner can change, with the change never re-scoring a batch that was
already decided.

**Tickets.** MIS-175 (E7-04 story), MIS-194 (BE · AQL engine + effective-dated
thresholds), MIS-195 (FE · AQL breakdown display + threshold settings screen).
Epic **E7 · Quality, COA, Documents & Reports**.

**Why here.** Phase 4 gives it severities; `business-rules.ts` (built, effective-dated)
gives it thresholds for free. It in turn unblocks final QC (E7-05, PARTIAL) and the COA's
accept/reject line.

**Touches.**
- `src/lib/mis/aql.ts` — **new**, the pure calculation, client-safe and unit-testable
- `src/server/mis/qc.ts` — call the engine; store the decision and the snapshot of the
  thresholds used
- `src/server/mis/business-rules.ts` — seed `AQL_CRITICAL_MAX`, `AQL_MAJOR_MAX`,
  `AQL_MINOR_MAX`, `AQL_SAMPLE_SIZE`
- `src/components/mis/qc/aql-breakdown.tsx` — **new**
- `src/components/mis/settings/settings-screen.tsx` — threshold rows

**Model.** `sonnet`. The arithmetic is standard AQL, the effective-dating mechanism
already exists and is proven by `MisBusinessRule`. What needs a competent model rather
than a cheap one is the rule-snapshot discipline: a decided batch must keep the
thresholds it was decided under.

**Acceptance check.**
- The engine is a **pure function** in `src/lib/mis/` — no Prisma import, so the client
  can render the breakdown without a round trip.
- Every boundary is a named test: zero defects, exactly at each threshold, one over each
  threshold, mixed severities, sample smaller than required.
- Changing a threshold today does **not** change any decision recorded yesterday — the
  decision row stores the thresholds it used (this is MIS-272's rule and it applies here).
- The breakdown card follows MIS_UI_SPEC §4.2: failure = `bg-red-50 border-red-200`.
- The threshold screen is Owner-only.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/lib/mis/aql.ts src/server/mis/qc.ts src/components/mis/qc/aql-breakdown.tsx
# on your Mac:
pnpm vitest run src/lib/mis/aql.test.ts
```

**Prompt.**
```
run phase 5 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Phase 4 (defect types with severity) must be merged first — check that MisDefectType
exists in prisma/schema.prisma before starting.

Read Arjun/app/docs/MIS_UI_SPEC.md first. Put the calculation in src/lib/mis/aql.ts as a
pure function with no Prisma import. Use the existing effective-dated business-rules
store for thresholds. Write the boundary tests as part of MIS-194 — I will run them.
Do MIS-194 (mis-be-build → mis-be-check), then MIS-195 (mis-fe-build → mis-fe-check).
Model: sonnet. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-04.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-05.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 5 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 6 · Line clearance

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-05.md`](./phase-reports/phase-05.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-06.md`](./phase-reports/phase-06.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 6 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** A supervisor must clear the line before production can be recorded on it, and
the clearance expires.

**Tickets.** MIS-137 (E6-02 story), MIS-148 (BE · `MisLineClearance` model + the
production precondition), MIS-149 (FE · clear-line action + clearance history).
Epic **E6 · Production & Wastage**.

**Why here.** It is the amber blocker card on the Supervisor home in `R2-Supervisor.png`
— a designed, approved screen element with nothing behind it. It is also a precondition
on `logProduction()`, so it must land before Phase 11 changes how production writes work.

**Touches.**
- `prisma/schema.prisma` + `migrations-pending` — `MisLineClearance` — **SCHEMA GATE**
- `src/server/mis/production.ts` — precondition on `logProduction()`
- `src/server/mis/line-clearance.ts` — **new**
- `src/components/mis/production/production-screen.tsx` — blocked state
- `src/components/mis/home/supervisor-home.tsx` — the amber blocker card

**Model.** `sonnet`. The state is simple but the precondition sits on the hottest write
path in the app (the 2–3 tap production screen), and the expiry window must come from
`business-rules.ts`, not a constant.

**Acceptance check.**
- `logProduction()` throws a typed, *specific* error when the line is not clear — the
  screen shows which machine and since when, per MIS_UI_SPEC §4.4 rule 2.
- Clearance validity window reads from a business rule, not a hard-coded number.
- Only SUPERVISOR and above can clear; the action is audited.
- An expired clearance blocks exactly like an absent one, but the message says "expired
  at HH:MM", not "not cleared".
- The Supervisor home amber card matches `R2-Supervisor.png` — amber tones from
  MIS_UI_SPEC §4.2, secondary button style from §4.3.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/line-clearance.ts src/server/mis/production.ts src/components/mis/production/production-screen.tsx
# on your Mac:
pnpm vitest run src/server/mis/line-clearance.test.ts
```

**Prompt.**
```
run phase 6 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

SCHEMA GATE phase — Half A first (schema + migrations-pending SQL), stop, I migrate,
then Half B in a fresh session.

Read Arjun/app/docs/MIS_UI_SPEC.md first and open
MIS-ArjunBhaskar/BPP-MIS-UI-Screenshots/screens/R2-Supervisor.png before touching the
supervisor home. The clearance window is a business rule, not a constant.
MIS-148 (mis-be-build → mis-be-check), then MIS-149 (mis-fe-build → mis-fe-check).
Model: sonnet. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-05.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-06.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 6 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 7 · Phase sign-off & the handover gate — **SCHEMA GATE**

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-06.md`](./phase-reports/phase-06.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-07.md`](./phase-reports/phase-07.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 7 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** A production phase cannot hand over to the next until the responsible person
signs it off, and the sign-off cannot be faked, skipped or back-dated.

**Tickets.** MIS-142 (E6-07 story), MIS-163 (BE · sign-off preconditions + notification),
MIS-164 (FE · sign-off summary screen + my-sign-offs list). Epic **E6**.
**Also completes the PARTIAL** MIS-136 / MIS-145 / MIS-146 (E6-01): `MisBomStage` exists
but there is no status field and no transition table, which is precisely what is missing.

**Why here.** It is the BPR spine. Line clearance (Phase 6) is its precondition; the BPR
print (E6-09, PARTIAL) and the "waiting on your sign-off" card on `R2-Supervisor.png`
both read from it.

**Touches.**

> ⚠ CORRECTED BY PHASE 7 — the module is **`job-phases.ts`**, not `phase.ts` (MIS-146 S1
> names it), and the phase is a **new `MisJobPhase` model**, not a status column on
> `MisBomStage` (MIS-145 names it; Appendix A §A.1 says why plan and execution stay apart).

- `prisma/schema.prisma` — new `MisJobPhase` + `MisJobPhaseStatus`; additive nullable
  columns on `MisProductionLog` (`jobPhaseId`, `wasteReason`) and `MisQcCheck`
  (`acknowledgedAt`, `acknowledgedById`, `acknowledgementNote`) — **SCHEMA GATE**
- `prisma/migrations-pending/<ts>_mis_job_phases/migration.sql` — table, partial unique
  index, four `CHECK` constraints, and the `mis_job_phase_gate` trigger
- `src/server/mis/job-phases.ts` — **new**, the state machine and the one transition table
- `src/server/mis/production.ts` — resolve and attribute the phase; third gate alongside D7
- `src/lib/mis/permissions.ts` — `phase.read`, `phase.write`, `phase.reopen`
- `src/server/notifications/index.ts` — a `mis.phase_ready` type on the **existing** table
  (MIS-163: do not build a second notification system). *Outside a `mis` folder — the PR
  line is that MIS-163 explicitly requires reuse of the workspace notification table.*
- `src/components/mis/production/sign-off-screen.tsx` — **new**, summary above the button
- `src/components/mis/home/supervisor-home.tsx` — the real sign-off list
- `src/components/mis/orders/**` — `No phase plan · not gated` (D10)

**Model.** **`opus`.** The transition table does not exist anywhere — not in the BRD, not
in Jira, not in the code. Deciding what the states are, which transitions are legal, who
may perform each, what happens to a phase whose signer leaves, and whether the gate is
enforced in the database or only in the server module is genuine design work. Do it once,
properly, with the strongest model, and write the transition table into this guide as an
appendix so later phases and the QA phase can test against it.

**Acceptance check.**
- A written transition table exists (states × roles × legal next states) before any code.
- The gate is enforced **in the database** (a check constraint or a partial unique index)
  as well as in the server module — MIS-146 asks for exactly this, and a server-only gate
  is bypassable by any future direct write.
- Sign-off records who, when, and against which clearance; timestamps are server-side —
  a client-supplied time is a fail.
- Skipping a phase, signing someone else's phase, and signing a phase with an open
  clearance requirement all throw specific errors.
- The notification path is transactional with the sign-off (it does not fire on rollback).

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/job-phases.ts src/server/mis/production.ts src/components/mis/production/sign-off-screen.tsx
# on your Mac:
pnpm vitest run src/server/mis/job-phases.test.ts
```

**Prompt.**
```
run phase 7 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

This is the design-heavy phase. Before writing any code, produce the state transition
table (states, roles, legal transitions, who may perform each) and append it to
Arjun/app/docs/DEVELOPMENT_GUIDE.md as "Appendix A — phase transition table". Show it to
me and wait for my OK.

Then: SCHEMA GATE Half A, I migrate, then Half B implements MIS-163 and MIS-164 one
ticket at a time with the build/check agent pair.
Read Arjun/app/docs/MIS_UI_SPEC.md first. Enforce the gate in the database as well as in
the server module.
Model: opus. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-06.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-07.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 7 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 8 · Worker allocation to process, machine and shift — **SCHEMA GATE**

> ⚠ UPDATED BY PHASE 2 — **"a supervisor's crew" may still be empty when you get here.**
> The resolver exists (`src/server/mis/visibility.ts`, compose
> `resolveVisibleEmployeeWhere`/`resolveVisibleEmployeeIds`; `null` means unscoped and is
> **not** the same as `[]`), but it stays dormant until manager links exist — Phase 3 was
> stamped to add them. Do not re-implement the rule here, and do not read `managerId`
> directly. Also: **machine and order scope is an open question, not a decided one** —
> `resolveVisibleMachineWhere`/`resolveVisibleOrderWhere` return `{}` on purpose. D4 covers
> people only, `MisOrder` has no crew/department column, and the approved Supervisor home
> shows the whole shop. It is logged as **D5** in `DECISIONS.md` — cite it, do not invent a
> rule for it.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-07.md`](./phase-reports/phase-07.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-08.md`](./phase-reports/phase-08.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 8 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** Know which worker is on which machine, on which process, in which shift — and
therefore who is free.

**Tickets.** MIS-260 (E4-02 story), MIS-262 (BE · `MisWorkerAllocation` + derived worker
availability), MIS-263 (FE · worker availability board + crew assignment).
Epic **E4 · Assignment Engine & Machine Scheduling**.

**Why here.** It mirrors `MisMachineAllocation` (built, E4-01) and depends on Phase 2's
pool resolver for "whose crew is this". The "My crew today 14/17" card on
`R2-Supervisor.png` reads from it.

**Touches.**
- `prisma/schema.prisma` + `migrations-pending` — `MisWorkerAllocation` — **SCHEMA GATE**
- `src/server/mis/worker-allocation.ts` — **new**
- `src/server/mis/machines-board.ts` — reuse the overlap-constraint approach
- `src/components/mis/machines/worker-board-screen.tsx` — **new**
- `src/components/mis/home/supervisor-home.tsx` — crew count card

**Model.** `sonnet`. The pattern is already in the repo (`MisMachineAllocation` with its
overlap constraint and availability derivation) — this is that, for people. Cheap enough
that `opus` would be waste; the overlap constraint and shift-boundary arithmetic are why
it is not `haiku`.

**Acceptance check.**

> ⚠ CORRECTED BY PHASE 8 — the constraint line below was wrong twice over, found by
> reading MIS-260/262 in full rather than this summary. **Machine allocation uses no
> database constraint** — `allocateMachine()` (`machines-board.ts:40-56`) is a
> read-then-write application check; there is no exclusion constraint anywhere in this
> schema. And **MIS-260/262 explicitly want the opposite of a constraint for workers**:
> *"the system warns which assignment is in the way, and allows it only with a deliberate
> confirmation, recorded"* (MIS-260), with an instruction to comment the asymmetry
> *"so nobody later 'fixes' it into a constraint"* (MIS-262). Build the warn-and-confirm
> flow below, not a constraint.

- Overlap detection returns a **warning naming the conflicting job and machine**, not a
  refusal — a person can be pulled between jobs mid-shift, unlike a machine. Proceeding
  requires a deliberate confirmation, and the override is recorded (audited).
- Availability is *derived* from allocations, never stored as a flag.
- A night shift crossing midnight allocates correctly (`src/lib/mis/shift-window.ts`, the
  shared helper Phase 8 extracted from `attendance.ts`'s private one — do not write a
  second one).
- The board is scoped by Phase 2's resolver; a supervisor sees his pool, with an honest
  empty state. Machines stay unscoped (**D5**) — this is people-only.
- "Counts, not rosters" — the card shows `14/17`, names one tap away (MIS_UI_SPEC §4.4
  rule 5).

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/worker-allocation.ts src/components/mis/machines/worker-board-screen.tsx
# on your Mac:
pnpm vitest run src/server/mis/worker-allocation.test.ts
```

**Prompt.**
```
run phase 8 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Phase 2 (visibility resolver) must be merged first. SCHEMA GATE — Half A, I migrate,
then Half B.

Read Arjun/app/docs/MIS_UI_SPEC.md first, and read src/server/mis/machines-board.ts —
mirror its allocation + overlap-constraint approach rather than inventing one. Reuse the
shift-window helper in src/server/mis/attendance.ts; do not write a second one.
MIS-262 (mis-be-build → mis-be-check), then MIS-263 (mis-fe-build → mis-fe-check).
Model: sonnet. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-07.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-08.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 8 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 9 · Wire allocations to job cards and orders — **SCHEMA GATE**

> ⚠ UPDATED BY PHASE 8 — **`MisWorkerAllocation` already carries `jobPhaseId`** (nullable
> FK to `MisJobPhase`, `onDelete: SetNull`), because MIS-260's own technical notes asked for
> it directly on the worker row, not routed through the machine allocation. Phase 9's "FKs
> on the allocation models" is therefore narrower than it reads: only
> **`MisMachineAllocation`** still needs the job-card/order wiring described below. Do not
> add a second `jobPhaseId` to `MisWorkerAllocation` or duplicate the phase check there —
> `worker-allocation.ts`'s `assignWorkers()` already accepts and stores it. `getMachineBoard()`
> and `allocateMachine()` in `machines-board.ts` are still what this phase needs to touch.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-08.md`](./phase-reports/phase-08.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-09.md`](./phase-reports/phase-09.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 9 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** Close the seam: an allocation points at the job card and order it serves, so
utilisation and history are answerable questions.

**Tickets.** MIS-261 (E4-03 story), MIS-265 (BE · foreign keys, phase check, migration).
Epic **E4**.

**Why here.** It is small, it is the last of E4, and it must come after both Phase 7
(there is a phase check in it) and Phase 8 (there are allocations to wire).

**Touches.**
- `prisma/schema.prisma` + `migrations-pending` — FKs on the allocation models —
  **SCHEMA GATE**
- `src/server/mis/worker-allocation.ts`, `machines-board.ts` — accept and validate the
  job-card/order link
- `src/server/mis/reports.ts` — utilisation can now group by order

**Model.** `sonnet`. Small but it is a migration against tables with live rows; the
backfill and nullable-then-tighten sequencing is the part worth paying for.

**Acceptance check.**
- New FKs are **nullable**, backfilled, and only then constrained — never added NOT NULL
  against existing rows.
- The phase check refuses an allocation to a job card whose phase is not open.
- `migration.sql` contains a rollback section (follow `20260915000000_mis_po_purpose`).
- Machine utilisation (E7-11, PARTIAL) can now be computed — leave a one-line note in the
  file saying so; do not build the report here.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/worker-allocation.ts src/server/mis/machines-board.ts
```

**Prompt.**
```
run phase 9 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Phases 7 and 8 must be merged first. SCHEMA GATE — Half A, I migrate, then Half B.
New foreign keys go in nullable, get backfilled, and are tightened in a later step —
never NOT NULL against live rows. Include a rollback section in migration.sql.
Read Arjun/app/docs/MIS_UI_SPEC.md first.
MIS-265 with mis-be-build → mis-be-check. Do not build the utilisation report here.
Model: sonnet. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-08.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-09.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 9 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 10 · Offline write queue — the infrastructure — **SCHEMA GATE**

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-09.md`](./phase-reports/phase-09.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-10.md`](./phase-reports/phase-10.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 10 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** One queue, one idempotency contract, used by every offline-capable write in the
app, so production entry and the kiosk do not each invent their own.

**Tickets.** MIS-25 (E8-04 story), MIS-85 (BE · idempotency keys + server-side conflict
resolution), MIS-86 (FE · IndexedDB queue, replay logic, sync indicator).
Epic **E8 · Platform, Non-functional & Deploy**.

**Why here.** Three separate features are blocked on it — E6-04 offline production
(Phase 11), E3-04 kiosk sync (Phase 13), and the PWA offline shell (E8-03, PARTIAL). Built
once here, they are cheap `sonnet` phases afterwards. Built three times, this project pays
for it three times and gets three different bugs.

**Touches.**
- `src/lib/mis/offline/queue.ts` — **new**, IndexedDB queue, client-safe
- `src/lib/mis/offline/idempotency.ts` — **new**, key generation, shared client/server
- `src/server/mis/idempotency.ts` — **new**, server-side dedupe + conflict resolution
- `prisma/schema.prisma` — an idempotency-key table — **SCHEMA GATE**
- `src/components/mis/shell/sync-indicator.tsx` — **new**
- `public/` — service worker (E8-03 is PARTIAL: manifest exists, no SW)

**Model.** **`opus`.** Conflict resolution is a real design problem: what happens when the
same punch arrives twice, when a production entry is queued against a phase that has since
been signed off, when the device clock is wrong, when the queue is replayed after the
order closed. No one has decided any of it, and a wrong decision here corrupts factory
data silently. This is exactly what the expensive model is for.

**Acceptance check.**
- The idempotency key is generated **on the client at the moment of the action** and
  survives the queue — not generated at send time, which would deduplicate nothing.
- Replaying the same queued write ten times produces one row and nine no-ops, and the
  no-ops return the original result rather than an error.
- A write that is no longer valid on arrival (phase signed off, order closed) is **parked
  with a reason and surfaced to the user**, never silently dropped and never force-applied.
- Device clock skew cannot move a server timestamp — the server stamps, the client's time
  is recorded as a separate `clientRecordedAt` field.
- The sync indicator matches `08-Empty-error-offline.png` and `K2-Offline-sync-queue.png`.
- `src/lib/mis/offline/**` imports nothing from `src/server/**`.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/lib/mis/offline src/server/mis/idempotency.ts src/components/mis/shell/sync-indicator.tsx
# on your Mac:
pnpm vitest run src/lib/mis/offline src/server/mis/idempotency.test.ts
```

**Prompt.**
```
run phase 10 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Design first, code second. Before writing anything, write the conflict-resolution rules
down — duplicate arrival, stale write (phase signed off / order closed), clock skew,
replay after failure — and append them to Arjun/app/docs/DEVELOPMENT_GUIDE.md as
"Appendix B — offline write contract". Show me and wait for my OK.

Then SCHEMA GATE Half A, I migrate, then Half B: MIS-85 (mis-be-build → mis-be-check),
then MIS-86 (mis-fe-build → mis-fe-check).
Read Arjun/app/docs/MIS_UI_SPEC.md first. Nothing under src/lib/mis/offline may import
from src/server. No new npm dependencies — IndexedDB directly.
Model: opus. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-09.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-10.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 10 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 11 · Offline production entry

> ⚠ UPDATED BY PHASE 10 — **this phase owns the service worker, and its scope is decided.**
> Phase 10 correctly declined to build it: it is absent from MIS-86's text and its caching
> strategy was an open question. But an offline queue is useless if the screen will not load
> offline, so it lands here. **Scope it narrowly and deliberately:** precache only the routes
> that must work with no network — the production entry screen and the kiosk punch screen —
> plus their static assets. Navigation is network-first with a cache fallback; data requests
> are never served stale from cache, because a supervisor acting on yesterday's machine list
> is worse than one who knows he is offline. The rest of the MIS is online-only by design; do
> not attempt to make every route offline-capable. Next.js 16 App Router serves RSC payloads,
> so cache navigation documents, not RSC flight responses. Record the final strategy as a
> D-number with the routes listed, so a later phase cannot widen it by accident.

> ⚠ UPDATED BY PHASE 7 — **`logProduction()` now passes three gates, and the third one
> resolves a phase.** `resolveJobPhaseForProduction` (`src/server/mis/job-phases.ts`) runs
> after the clearance check and stamps `jobPhaseId` on the row. Three consequences for the
> offline queue: (1) **re-resolve at replay, never at queue time** — the active phase can
> change while a write sits in the queue, and the queued entry belongs to whichever phase is
> running when it lands; (2) a refusal carrying reason `NO_ACTIVE_PHASE` or
> `AMBIGUOUS_ACTIVE_PHASE` is a **park with a readable reason**, not a discard (both messages
> already name the phase and its in-charge); (3) `ALREADY_IN_STATE` from a replay means that
> transition already succeeded — **retire it from the queue, do not park it**. Appendix A
> §A.3 and §A.8 are the contract.
>
> > ⚠ CORRECTED BY PHASE 10 — point (3) originally read *"`ALREADY_IN_STATE` from a replayed
> > **sign-off**"*, and this stamp closed by saying queued sign-offs are stamped at replay.
> > **Sign-off is not offline-capable at all** — Appendix B §B.1 excludes it, because its
> > totals cannot be vouched for offline. `ALREADY_IN_STATE` still matters for every
> > transition that *is* replayable, and the retire-don't-park rule stands. What this phase
> > queues is **production entries**, not signatures.

> ⚠ UPDATED BY PHASE 6 — **`logProduction()`'s `machineId` is now required, not
> optional** (D7/D8 in `DECISIONS.md`): the line-clearance precondition (`assertLineCleared`
> in `src/server/mis/line-clearance.ts`) is machine-scoped and cannot run without one.
> `production-screen.tsx` and `production-detail-screen.tsx` both already carry a machine
> `Select`, a try/catch around the log call, an amber error box for a thrown
> `LineClearanceBlockedError` (its `.message` already says which machine and since when —
> no extra fields survive the server-action boundary), and an inline "Clear the line" retry
> wired to `clearLineAction`. When this phase switches the screen from `await` to a queued
> write, carry that error surface through rather than dropping it, and make sure the
> replay-time precondition re-check (this phase's own acceptance criterion) still throws
> `LineClearanceBlockedError` so the queued item's "parked with a readable reason" is the
> same reason the live path already shows.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-10.md`](./phase-reports/phase-10.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-11.md`](./phase-reports/phase-11.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 11 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** The 2–3 tap production screen keeps working when the factory wifi drops.

**Tickets.** MIS-139 (E6-04 story), MIS-154 (BE · server-side idempotency for production
writes), MIS-155 (FE · queue integration + sync indicator). Epic **E6**.

**Touches.**
- `src/server/mis/production.ts` — accept and honour an idempotency key
- `src/components/mis/production/production-screen.tsx` — queue instead of await
- `src/components/mis/home/supervisor-home.tsx` — pending-sync count

**Model.** `sonnet`. Phase 10 decided everything hard; this is applying a contract that is
now written down. It stays above `haiku` only because the production write already has a
line-clearance precondition (Phase 6) and a phase gate (Phase 7) that must be re-checked
*at replay time*, not at queue time.

**Acceptance check.**
- Recording production with the device in aeroplane mode returns immediately, shows
  pending, and lands exactly once on reconnect.
- Preconditions (clearance valid, phase open) are evaluated **on the server at replay**,
  and a write that fails them is parked with a readable reason, not discarded.
- Double-tapping the confirm button produces one entry.
- The screen still meets the 2–3 tap target — check against `P4-Two-tap-production-entry.png`.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/production.ts src/components/mis/production/production-screen.tsx
# on your Mac:
pnpm vitest run src/server/mis/production.test.ts
```

**Prompt.**
```
run phase 11 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Phase 10 must be merged first — read Appendix B (offline write contract) in this guide
and follow it exactly; do not invent a second queue or a second key scheme.
Read Arjun/app/docs/MIS_UI_SPEC.md first.
MIS-154 (mis-be-build → mis-be-check), then MIS-155 (mis-fe-build → mis-fe-check).
Preconditions are re-checked on the server at replay time, not at queue time.
Model: sonnet. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-10.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-11.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 11 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 12 · Kiosk device enrolment & master-data pull — **SCHEMA GATE**

> ⚠ UPDATED BY PHASE 12 — **built; do not re-run.** Enrolment is device-asks / Admin-grants
> (**D18**); the pull payload is `id`, `name`, `badgeCode`, `shift` and nothing else (**D19**);
> `/mis/settings/devices` is the Admin screen and the attendance home's top card reads device
> staleness. Read `phase-reports/phase-12.md` for the routes, the auth exemption and what is
> unverified.

> ⚠ UPDATED BY PHASE 11 — the service worker (`public/sw.js`, **D16**) caches the *documents*
> `/mis/production` and `/mis/kiosk` and never intercepts `/api/**`, non-GET requests or flight
> responses. So the kiosk's **master-data pull is your own job**: it must be an API/action
> response the kiosk stores itself (IndexedDB), with its own "as of" time — the worker will not
> hold it for you and must not be widened to. Also: `getDeviceId()` in
> `src/lib/mis/offline/device.ts` already names a browser install for the queue envelope; if
> enrolment needs a durable device identity, decide deliberately whether it is that id or a
> server-issued one, and record it as a D-number.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-11.md`](./phase-reports/phase-11.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-12.md`](./phase-reports/phase-12.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 12 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** A gate tablet can be enrolled once, identified thereafter, and can pull down the
employee list it needs to work offline.

**Tickets.** MIS-225 (E3-05 story), MIS-243 (BE · device model, enrolment, the minimal
pull payload), MIS-244 (FE/APP · enrolment flow, device list, staleness indicator).
Epic **E3 · Attendance & Workforce**.

**Why here.** Phase 13's punch ingestion needs a device identity to attribute punches to,
and the green "Gate kiosk online · Synced 40 seconds ago" card on the Attendance Operator
home (`R5`, MIS_UI_SPEC §4.6) is reading a staleness value that nothing currently produces.

**Touches.**
- `prisma/schema.prisma` + `migrations-pending` — `MisKioskDevice` — **SCHEMA GATE**
- `src/server/mis/kiosk-device.ts` — **new**
- `src/app/api/mis/kiosk/enrol/route.ts`, `.../pull/route.ts` — **new**, thin handlers
- `src/components/mis/kiosk/device-list-screen.tsx` — **new**
- `src/components/mis/home/attendance-home.tsx` — kiosk-health card

**Model.** `sonnet`. Device identity and a token that a tablet on the factory floor holds
indefinitely is security-adjacent, which rules out `haiku`; but the pattern (enrol →
token → scoped pull) is standard enough not to need `opus`.

**Acceptance check.**
- Enrolment is one-time-code based; the tablet never holds a user's credentials. **(Built per
  D18, not the older "Admin-initiated" wording: the tablet asks, an Owner/Admin grants — K10.)**
- The pull payload contains **only** what a kiosk needs — employee id, name, badge code,
  active shift. **No wages, no salary, no personal data beyond the badge.** This is the
  wage-leak rule applied to an API.
- A revoked device's token stops working immediately, and its queued punches are still
  accepted (the punches are real even if the tablet is retired).
- Staleness is computed from the device's last successful sync; the card is green /
  amber / red per MIS_UI_SPEC §4.2.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/kiosk-device.ts src/components/mis/kiosk/device-list-screen.tsx
# on your Mac:
pnpm vitest run src/server/mis/kiosk-device.test.ts
```

**Prompt.**
```
run phase 12 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

SCHEMA GATE — Half A, I migrate, then Half B.
Read Arjun/app/docs/MIS_UI_SPEC.md first and open
MIS-ArjunBhaskar/BPP-MIS-UI-Screenshots/screens/K1-Scan-confirm.png before the kiosk work.
The pull payload carries badge code, name, id and shift ONLY — no wage or salary field
may appear in it. API routes stay thin; logic goes in src/server/mis/kiosk-device.ts.
MIS-243 (mis-be-build → mis-be-check), then MIS-244 (mis-fe-build → mis-fe-check).
Model: sonnet. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-11.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-12.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 12 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 13 · Kiosk punch ingestion & sync

> ⚠ UPDATED BY PHASE 13 (Half B) — **built; do not re-run.** Server: `src/server/mis/attendance-punch.ts`
> (`ingestDevicePunch` for a tablet's token, `submitPunch` for the portal's session, both through
> `runIdempotent`); route `/api/mis/kiosk/punch` (now the fourth exact entry in `KIOSK_DEVICE_ROUTES`).
> UI: the K2 queue on `/mis/kiosk`. Decisions **D20–D23**. Two findings beyond the ticket: **Phase 10's
> queue tracked a punch's predecessor per KIND, so one unrecognised badge would have parked every other
> person's clock-out** — fixed to per person (`SUBJECT_OF` in `queue.ts`); and **`kiosk-device.ts`'s pull
> resolved "today" on the server's clock** — fixed to the factory's (D22). Read `phase-reports/phase-13.md`.

> ⚠ UPDATED BY PHASE 13 (Half A) — **this is a SCHEMA GATE phase and runs in two halves.** K2
> says punches are immutable and a Fix records a correction that supersedes them; a day cannot
> be rebuilt from out-of-order arrivals unless the punches are kept, and `MisAttendance`'s single
> clock-in/clock-out pair cannot keep them. So there is a new model, `MisAttendancePunch`
> (`prisma/migrations-pending/20260925000000_mis_attendance_punches`), with a trigger that refuses
> UPDATE and DELETE. **Corrections to this section's older text:** (1) the shift-window helper
> is `src/lib/mis/shift-window.ts`, not `attendance.ts` — `attendance.ts` only imports it; it was
> extended with `shiftWrapsMidnight`, not duplicated. (2) **Lateness and overtime are NOT computed
> anywhere** despite "E3-06, built" — `lateMinutes`/`otMinutes` are only read. Ingestion does not
> invent a rule for them (**D20**). (3) The queue kinds already exist as `attendance.punch_in` /
> `attendance.punch_out` (client-recorded, **D15**); do not add a third. (4) The pure day
> derivation (`src/lib/mis/attendance-day.ts`, 30 tests) is done — Half B wires it to the
> database. (5) Decisions: **D20**, **D21**. (6) K5's early-clock-out approval (MIS-228/250) and the
> Expo operator PIN (K9) are the tablet app's and are out of scope here.

> ⚠ UPDATED BY PHASE 12 — the device identity and the door already exist. (1) **Authenticate a
> tablet with `authenticateDevice(request.headers.get('authorization'), { allowRevoked: true })`**
> from `src/server/mis/kiosk-device.ts` — `allowRevoked` is offered for exactly this route,
> because a retired tablet's queued punches are real and must still land (**D18**); the returned
> device has `revoked: true` so you can flag them. Every other kiosk call must NOT pass it.
> (2) **A new kiosk route is unreachable by a tablet until you add it, by exact path, to
> `KIOSK_DEVICE_ROUTES` in `src/lib/mis/kiosk-routes.ts`** — the login guard
> (`src/lib/supabase/middleware.ts`, a non-`mis` file) skips only that exact list, and
> `kiosk-routes.test.ts` pins it at three. Adding the punch route means editing that list AND
> that test, and the route must authenticate by token itself before reading or writing anything:
> the exemption moves the check, it does not remove it. Never widen it to a prefix. (3) After a
> batch lands, call `recordDeviceSync(device, health)` — it is what turns the attendance-home
> card green (**D19**); the tablet's own `queuedPunches`/battery come through `parseHealthReport`.
> (4) `mis_queued_writes.device_id` is still plain text; it can now reference
> `MisKioskDevice.id` if you want it tightened (additive). (5) The kiosk *app* (Expo, K1–K12
> tablet screens) is a separate codebase — nothing in this repo runs on the tablet.

> ⚠ UPDATED BY PHASE 11 — **the machinery you need already exists; use it, do not build a
> second.** (1) The kiosk screen `/mis/kiosk` is **already in the service worker's list**
> (**D16**) and is precached and served network-first there. **Do not add routes to
> `public/sw.js`**; if the kiosk needs an asset the worker does not find, fix discovery, not
> the list — `src/lib/mis/offline/sw.test.ts` pins the list at exactly two and will fail if it
> grows. (2) Register the punch senders in `src/components/mis/shell/offline-senders.ts` next
> to `production.log`, and have the server action call `runIdempotent()` with
> `submitProductionLog` as the pattern to copy: **claim-first in one transaction**, an
> envelope `queuedBy` checked against the signed-in user, `live: true` for an attempt made
> while online (never parks, never records a refusal) and the default replay mode for the
> queue. (3) **D15** stands: punches are client-recorded, sign-offs server-stamped; clock skew
> parks, it does not clamp. (4) **D17** decides which parks a human may retry
> (`RETRYABLE_PARK_REASONS` in `idempotency.ts`; `canRetry()` in `queue.ts`) — a new park
> reason is non-retryable until D17 says otherwise. (5) Phase 10's `upsert`-based dedupe had a
> double-apply race under concurrency and was replaced; there is a fake-DB harness
> (`src/server/mis/offline-fake-db.ts`) that proves atomicity and races — reuse it.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-12.md`](./phase-reports/phase-12.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-13.md`](./phase-reports/phase-13.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 13 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** Punches captured on the tablet, possibly hours earlier and offline, land exactly
once and rebuild the attendance day correctly.

**Tickets.** MIS-224 (E3-04 story), MIS-240 (BE · punch ingestion endpoint + day rebuild),
MIS-241 (APP · sync loop, backoff, failure surfacing). Epic **E3**.
Note MIS-223 / MIS-237 / MIS-238 (the Expo app itself) are **PARTIAL** — a web
`kiosk-screen.tsx` exists with no scanner and no native wrapper. This phase builds the
*server contract and the sync loop*; the native Android wrapper is a separate decision to
put to Arjun if he still wants it.

**Touches.**
- `src/app/api/mis/kiosk/punch/route.ts` — **new**, thin
- `src/server/mis/attendance.ts` — idempotent ingestion + day rebuild
- `src/components/mis/kiosk/kiosk-screen.tsx` — sync loop, backoff, failure surfacing

**Model.** `sonnet`. The idempotency contract comes from Phase 10; the shift-window helper
(MIS-233) already exists. What is left is the day-rebuild arithmetic, which is fiddly but
specified by the existing lateness/OT rules (E3-06, built).

**Acceptance check.**
- The same punch sent five times creates one punch and rebuilds the day once.
- A punch arriving out of order (clock-out before its clock-in) rebuilds correctly, it
  does not create a second attendance day.
- A punch arriving after the correction window closed is parked for the Super Attendance
  Operator, not silently applied — MIS_UI_SPEC §4.6 already designs that card.
- Backoff is exponential and capped; a permanently failing punch surfaces on the tablet
  with the reason, per `K2-Offline-sync-queue.png`.
- Night shift crossing midnight attributes to the correct attendance day.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/attendance.ts src/components/mis/kiosk/kiosk-screen.tsx
# on your Mac:
pnpm vitest run src/server/mis/attendance.test.ts
```

**Prompt.**
```
run phase 13 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Phases 10 and 12 must be merged first. Follow Appendix B (offline write contract).
Read Arjun/app/docs/MIS_UI_SPEC.md first and open
MIS-ArjunBhaskar/BPP-MIS-UI-Screenshots/screens/K2-Offline-sync-queue.png.
Reuse the shift-window helper already in src/server/mis/attendance.ts — do not write a
second one. The native Android wrapper is NOT in scope; note it and move on.
MIS-240 (mis-be-build → mis-be-check), then MIS-241 (mis-fe-build → mis-fe-check).
Model: sonnet. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-12.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-13.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 13 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

## 6. The QA phases (14–20) — what "tested" means here

> ⚠ UPDATED BY PHASE 14 — **two statements below were wrong and are corrected in place.** `vitest` runs in the
> agent shell (`pnpm vitest run`), so a QA phase runs its own tests and is not done until they pass. And QA phases
> touching access, roles or money run on **sonnet**, not haiku. The three-part definition of "tested" stands, with
> one addition proven by Phase 14: a bug is recorded as a test asserting the CORRECT behaviour wrapped in
> `it.fails`, so the suite stays green while it exists and flips red when it is fixed.

54 of the 92 remaining tickets are QA. They have been unbuilt for a reason: the MIS module
has **7 test files** in a codebase with 54, and none of them cover a business rule.
Before writing any of them, agree the definition, because "tested" has to mean something
this environment can actually deliver.

**`next build` cannot run in the agent shell; `vitest` can (Phase 14).** A QA phase
produces three things, and only the first is automated:

1. **Unit tests on server functions** — Vitest, colocated as `<module>.test.ts` next to
   the module, the convention already used by `guard.test.ts` and `permissions.test.ts`.
   Pure logic and rule arithmetic, with the database mocked. The agent **writes and runs** them
   (`pnpm vitest run`). A QA phase is not done until they pass.
2. **A permission-matrix test per role** — for every server module the phase covers, a
   table-driven test that loops all eight roles (`OWNER ADMIN SUPERVISOR QC
   ATTENDANCE_OPERATOR SUPER_ATTENDANCE_OPERATOR WORKER STORE_GUY`) against every exported
   function and asserts allow or `MisForbiddenError`. This is the single highest-value
   test shape in this project and it is nearly free to generate. It also catches wage
   leakage: any function returning a wage or salary field must deny all seven non-OWNER
   roles.
3. **A scripted manual walkthrough per role** — a numbered script in
   `Arjun/app/docs/qa/<area>-walkthrough.md`: log in as this role, tap this, expect
   exactly this, with the screenshot it should match. Written so a non-developer can run
   it on a phone and tick boxes. This is what replaces the end-to-end tests we cannot run,
   and it is what gets handed to Arjun's team at UAT.

**A QA phase never modifies application code.** If it finds a bug, it writes the failing
test, records the bug in `Arjun/app/docs/qa/FINDINGS.md`, and stops. Fixing it is a
separate, scheduled piece of work — a QA phase that starts fixing things is how a
one-session phase becomes a four-hour one.

**Model for every QA phase: `sonnet`** (raised from haiku by Phase 14 — a wrong test in
an access or money phase is worse than none). The matrix is supplied and the modules are
named, but judging what a permission *should* allow is not mechanical.

---

### Phase 14 · QA · access, roles and money leaks

> ⚠ UPDATED BY PHASE 14 — **built; do not re-run — fix the findings instead.** 16 new test files and one extended (suite: 2,031 passing, 49
> `it.fails` = open findings F-01…F-13 in `qa/FINDINGS.md`). Money-leak sweep: `wage-leak.test.ts`,
> `wage-screens.test.tsx`, `audit-payloads.test.ts`, `rule-history.test.ts`; gates: `server-gates.test.ts`,
> `permission-matrix.test.ts`, `lib/mis/permissions.test.ts`. **5 HIGH findings**
> (F-01, F-02, F-03, F-08, F-10) — **all fixed by Phase 14F (2026-09-21)**; F-05, F-06, F-09, F-11, F-13 remain. Not covered: PO rates and item
> price screens, the reports and home pages rendered per role, real Postgres, a real browser. The role
> walkthrough is `qa/access-walkthrough.md`.

> ⚠ UPDATED BY PHASE 2 — **MIS-49's cross-role visibility tests must set up manager links
> first, or they will assert nothing.** `visibility.ts` narrows only once an org chart
> exists, so a fixture with no `managerId` returns *unscoped* for every role and a naive
> "supervisor cannot see X" test passes for the wrong reason. Seed the hierarchy in the
> fixture, and assert the `null` (unscoped) vs `[]` (sees nobody) distinction explicitly.
> `src/server/mis/visibility.test.ts` already covers the resolver itself — MIS-49 is about
> the lists composing it. Attendance, machines and orders are **not** scoped (D5), so do
> not write tests asserting that they are.

> ⚠ UPDATED BY PHASE 3 — **MIS-52's invite lifecycle has two real outcomes, test both.**
> `src/server/mis/users.ts:inviteMisUser` either (a) grants a role immediately when the
> email already has a workspace `UserProfile` — no seat spent, no email sent — or (b) sends
> a real invite through `@/server/admin`'s `inviteUser` (base role always `'member'`) when
> it does not. Path (b) cannot carry a `MisRole` through acceptance (no MIS invite table
> exists to hold one — BR-001), so the accepted person lands in `listPendingMisGrants()`
> until the Owner calls `grantMisRole`. A lifecycle test that only exercises path (a) proves
> nothing about the seat-limit guard, which lives in the reused pipeline, not here. Also new:
> the `'users.invite'` MIS action (`src/lib/mis/permissions.ts`), OWNER-only by construction
> — extend the permission-matrix table for it alongside `wages.read`.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-13.md`](./phase-reports/phase-13.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-14.md`](./phase-reports/phase-14.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 14 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Tickets.** MIS-34 (role resolution + migration safety), MIS-40 (role-based navigation +
toggle persistence), MIS-43 (the reference-slice full-slice tests), MIS-46 (**money-leak
tests across API, export, print and audit**), MIS-49 (cross-role visibility), MIS-52
(invite lifecycle + seat limit), MIS-272 (a rule change never moves a number already
recorded). Epic **E1**.

**Why first among the QA phases.** MIS-46 is the wage-leak sweep. It is the one test suite
that, if it exists and passes, retires the project's worst single risk. Everything else in
QA can wait behind it.

**Touches.** `src/server/mis/{roles,employee,users,wage-type,business-rules}.test.ts`,
`src/lib/mis/permissions.test.ts` (extend), `src/components/mis/shell/*.test.tsx`,
`docs/qa/access-walkthrough.md`.

**Model.** `sonnet` (corrected by Phase 14 from `haiku`; see §6). If a test needs a
policy decision to write, record it as the next D-number (§1A) — Phase 14 added D24 and D25.

**Acceptance check.**
- One table-driven permission matrix covering all eight roles × every export of every
  module named above.
- MIS-46 specifically: a test that serialises every API response, every CSV export, every
  print route and every audit payload reachable by a non-OWNER role, and asserts the
  strings `wage`, `salary`, `amount`, `rate` and `₹` do not appear. This is a grep-shaped
  test and it is deliberately blunt.
- MIS-272: change a business rule with `effectiveFrom` today, assert a payroll figure
  computed for last month is byte-identical before and after.
- `docs/qa/access-walkthrough.md` has a numbered script per role with the expected tabs
  from MIS_UI_SPEC §4.5.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck   # nothing
node_modules/.bin/eslint $(git diff --name-only --diff-filter=ACM | grep -E '\.tsx?$')
pnpm vitest run          # the agent runs this itself (Phase 14)
pnpm build
```

**Prompt.**
```
run phase 14 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Read Arjun/app/docs/MIS_UI_SPEC.md and §6 of the guide (what "tested" means) first.
Write tests only — do not modify any application code. If you find a bug, write the
failing test, log it in Arjun/app/docs/qa/FINDINGS.md, and keep going.
Run `pnpm vitest run` yourself. Follow the existing style in src/server/mis/guard.test.ts.
Model: sonnet.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-13.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-14.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 14 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 15 · QA · masters, import and test fixtures

> ⚠ UPDATED BY PHASE 14 — **fixtures and the item price.** Any fixture that touches people needs a real
> `managerId` tree (`testing/people-world.ts`), or the visibility resolver returns unscoped for everyone. The fake
> DB in `testing/` throws on a query operator it does not know, so extend it rather than loosen it. The item
> import (`api/mis/inventory/import`) writes `pricePerUnit`; who may SEE that price is **D24** (F-06 in
> `qa/FINDINGS.md`) — test that a non-Owner's payload carries no price, not that a column is hidden.
> Also: Phase 14 proved `pnpm vitest run` **runs in the agent shell** and that QA phases run on **sonnet** —
> disregard any line below that says otherwise. Shared test helpers now exist in `src/server/mis/testing/`
> (`ast.ts` source scanner, `wage-world.ts` fake DB + leak detector, `people-world.ts` real org chart); reuse them.
> Findings are asserted as the CORRECT behaviour under `it.fails` (a fix turns the case red — delete the `.fails`).


> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-14.md`](./phase-reports/phase-14.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-15.md`](./phase-reports/phase-15.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 15 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Tickets.** MIS-66 (batch traceability), MIS-75 (import edge cases against the real
client workbook), MIS-91 (test factories + seed idempotency). Epics **E2 / E8**.

**Touches.** `src/server/mis/{item,master-option,inventory}.test.ts`,
`src/test/factories/mis.ts` (**new**), `docs/qa/masters-walkthrough.md`.

**Note.** MIS-91's factories are infrastructure for every later QA phase — build them
here, properly, and the rest get cheaper. Seed idempotency means running `pnpm db:seed`
twice leaves the same row count; that assertion is worth more than it looks.

**Model.** `sonnet` (corrected by Phase 14 from `haiku`; see §6). If a test needs a
policy decision to write, record it as the next D-number (§1A) — Phase 14 added D24 and D25.

**Acceptance check.** Import tests cover: duplicate SKU skipped not errored, missing
required column, wrong unit string, empty sheet, 146-row happy path, and a row whose item
code contains `/` (must be rejected or normalised to `-`, per MIS_UI_SPEC §3).

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck   # nothing
node_modules/.bin/eslint $(git diff --name-only --diff-filter=ACM | grep -E '\.tsx?$')
# then, on your Mac — the agent cannot run vitest:
pnpm vitest run src/server/mis src/test/factories
```

**Prompt.**
```
run phase 15 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Read MIS_UI_SPEC.md and §6 of the guide first. Build the shared test factories
(MIS-91) before the feature tests — later QA phases depend on them. Tests only, no
application code. Log bugs to Arjun/app/docs/qa/FINDINGS.md.
Model: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-14.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-15.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 15 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 16 · QA · orders, BOM and job cards

> ⚠ UPDATED BY PHASE 14 — **money in the BOM and approvals payloads (D24).** `getBom` returns every material's
> `ratePerUnit` to ADMIN, SUPERVISOR and QC and the screen only hides it (F-06, 3 `it.fails` cases in
> `wage-leak.test.ts`). `getPendingApprovals` serves leave requests and POs to roles that cannot read them (F-13).
> Assert on the serialised PAYLOAD, as `wage-screens.test.tsx` does, never on what a component draws.
> Also: Phase 14 proved `pnpm vitest run` **runs in the agent shell** and that QA phases run on **sonnet** —
> disregard any line below that says otherwise. Shared test helpers now exist in `src/server/mis/testing/`
> (`ast.ts` source scanner, `wage-world.ts` fake DB + leak detector, `people-world.ts` real org chart); reuse them.
> Findings are asserted as the CORRECT behaviour under `it.fails` (a fix turns the case red — delete the `.fails`).


> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-15.md`](./phase-reports/phase-15.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-16.md`](./phase-reports/phase-16.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 16 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Tickets.** MIS-111 (order numbering under concurrency), MIS-114 (BOM tree integrity +
money isolation), MIS-117 (rebuild both real BOMs on a phone), MIS-120 (money-leak hunt
across every BOM surface), MIS-123 (approval gate cannot be bypassed), MIS-126 (build a
template without touching code), MIS-129 (end-to-end PO → order → BOM → approval → job
card), MIS-131 (print on real paper beside the Excel), MIS-134 (capture the real sample PO
+ duplicate handling). Epic **E5** — 9 tickets, `MIS-111 → MIS-134`.

**Touches.** `src/server/mis/{orders,bom,approvals}.test.ts`,
`docs/qa/orders-walkthrough.md`, `docs/qa/print-comparison.md`.

**Decision.** E5 is the **customer** side of the business, so every "PO" in this phase's
tickets means **Customer PO** — see **D3** in [`DECISIONS.md`](./DECISIONS.md). MIS-134's
"real sample PO" is the document the customer sent, captured as a reference on the Order;
it is not a `src/server/mis/po.ts` record. Cite D3 in the walkthroughs and use the two
names D3 fixes ("Customer PO" / "Purchase Order") in every script you write.

**Note.** MIS-117, MIS-129, MIS-131 and MIS-134 are inherently manual — a phone, a
printer, and the client's real sample PO. They become walkthrough scripts, not Vitest
files, and the phase must say so rather than pretending to automate them.

**Model.** `sonnet` (corrected by Phase 14 from `haiku`; see §6). If a test needs a
policy decision to write, record it as the next D-number (§1A) — Phase 14 added D24 and D25.

**Acceptance check.** Order numbering test hammers the generator concurrently and asserts
no duplicates. MIS-120 reuses the Phase 14 money-leak sweep against BOM routes. MIS-123
attempts every bypass — direct server call, stale client state, role escalation — and
asserts each throws.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck   # nothing
node_modules/.bin/eslint $(git diff --name-only --diff-filter=ACM | grep -E '\.tsx?$')
# then, on your Mac — the agent cannot run vitest:
pnpm vitest run src/server/mis
```

**Prompt.**
```
run phase 16 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Read MIS_UI_SPEC.md and §6 first. Use the factories from Phase 15.
"PO" in every E5 ticket means Customer PO — read D3 in Arjun/app/docs/DECISIONS.md and
cite it. Do not test src/server/mis/po.ts here; that is the supplier PO and it belongs to
Phase 20.
MIS-117, MIS-129, MIS-131 and MIS-134 are manual — write them as numbered walkthrough
scripts in Arjun/app/docs/qa/, do not fake them as unit tests.
Tests and docs only, no application code. Log bugs to docs/qa/FINDINGS.md.
Model: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-15.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-16.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 16 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 17 · QA · production and wastage

> ⚠ UPDATED BY PHASE 14 — the model and vitest corrections below apply here too, and F-08 (`qa/FINDINGS.md`)
> shows the shape of bug to look for: a reader that recomputes a recorded number with a rule read "as of now".
> Also: Phase 14 proved `pnpm vitest run` **runs in the agent shell** and that QA phases run on **sonnet** —
> disregard any line below that says otherwise. Shared test helpers now exist in `src/server/mis/testing/`
> (`ast.ts` source scanner, `wage-world.ts` fake DB + leak detector, `people-world.ts` real org chart); reuse them.
> Findings are asserted as the CORRECT behaviour under `it.fails` (a fix turns the case red — delete the `.fails`).


> ⚠ UPDATED BY PHASE 11 — production logging changed underneath this phase. **`production.test.ts`
> and `idempotency.test.ts` now exist** (41 and 40 tests, on an in-memory fake DB) — extend
> them. What is already proven: the central claim (a log queued under a valid clearance and
> replayed after it expired **parks**, neither applying nor dropping), exactly-once under a
> race, live-vs-replay behaviour, actor mismatch, **D14** (a closed order refuses production;
> `reopenOrder` is the way back), **D17** (which parks a person may retry), and that an
> unknown body field cannot mass-assign. What is yours: the *numbers* — hand-check fixtures
> for wastage and yield against the previous phase's hand-over — and one named test per
> illegal transition. `logProductionAction` is **gone**; the screens call
> `submitProductionLiveAction` / `replayProductionAction`, which **return** outcomes as
> values (a thrown server-action error is replaced by a generic message in production builds,
> so `err.message` is unusable for anything the person must act on — test outcomes, not
> messages). The order-status picker and the closed list were also corrected to include
> `COMPLETED` (single source: `src/lib/mis/order-status.ts`).

> ⚠ UPDATED BY PHASE 7 — **the module is `job-phases.ts`, not `phase.ts`** (correct the
> Touches list below), and much of MIS-147/MIS-165 already exists: `job-phases.test.ts` has
> 61 tests over the transition matrix, the identity rule and the preconditions, and
> **`job-phases.gate.db.test.ts` has 9 that run against a real database** — it opens one
> transaction, brackets each test in a SAVEPOINT, and rolls back, so it writes nothing and
> `describe.skipIf` skips it when no `DIRECT_URL` is present. Extend those rather than
> starting new files. What is **not** covered and is yours: one named test per *illegal*
> transition in Appendix A §A.3 (the table is the spec — every ✗ cell deserves a test), and
> MIS-162's hand-checked fixture, which must read output against the previous phase's
> hand-over rather than an order quantity (**D13** — orders carry no quantity column).
> **D11** added `waste_reason`; MIS-160 is marked YES in `TICKET_INVENTORY.md` on the
> strength of the aggregates alone, so treat the reason half as newly built and untested.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-16.md`](./phase-reports/phase-16.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-17.md`](./phase-reports/phase-17.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 17 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Tickets.** MIS-147 (every path around the phase gate), MIS-150 (clearance expiry + role
boundaries), MIS-153 (time the entry screen with a real supervisor), MIS-156 (lose the
connection at every stage), MIS-159 (trace a batch across several orders), MIS-162 (totals
tie out against a hand-checked fixture), MIS-165 (sign-off cannot be faked or forced),
MIS-168 (board correctness and performance at scale), MIS-170 (print a BPR beside the
client's blank form). Epic **E6** — 9 tickets, `MIS-147 → MIS-170`.

**Depends on.** Phases 6, 7 and 11 — this phase tests what they build. Do not run it
before them.

**Touches.** `src/server/mis/{production,line-clearance,job-phases,traceability}.test.ts`,
`src/server/mis/job-phases.gate.db.test.ts`, `docs/qa/production-walkthrough.md`.

**Model.** `sonnet` (corrected by Phase 14 from `haiku`; see §6). If a test needs a
policy decision to write, record it as the next D-number (§1A) — Phase 14 added D24 and D25.

**Acceptance check.** MIS-147 and MIS-165 test against **Appendix A**, the transition
table Phase 7 wrote — every illegal transition in that table gets a named test. MIS-162
uses a hand-computed fixture checked into `src/test/fixtures/` so the expected number is
auditable. MIS-153 and MIS-170 are walkthrough scripts.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck   # nothing
node_modules/.bin/eslint $(git diff --name-only --diff-filter=ACM | grep -E '\.tsx?$')
# then, on your Mac — the agent cannot run vitest:
pnpm vitest run src/server/mis
```

**Prompt.**
```
run phase 17 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Phases 6, 7 and 11 must be merged first. Read MIS_UI_SPEC.md, §6 of the guide, and
Appendix A (phase transition table) — every illegal transition in that table needs a
named test. Use the Phase 15 factories.
MIS-153 and MIS-170 are manual walkthroughs, not unit tests.
Tests and docs only. Log bugs to docs/qa/FINDINGS.md.
Model: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-16.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-17.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 17 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 18 · QA · quality, COA, documents and reports

> ⚠ UPDATED BY PHASE 14 — **the reports page was NOT rendered by Phase 14** (it fans out to five queries); its
> store-value leak is proven only at function level (F-06, `getStoreReport`). Render it here per role. Whether a QC
> user may see the AQL limits that `recordAqlSample` returns is an open question (see the questions section of
> `qa/FINDINGS.md`), not a test. Recorded QC decisions are pinned as never recomputed (`rule-history.test.ts`).
> Also: Phase 14 proved `pnpm vitest run` **runs in the agent shell** and that QA phases run on **sonnet** —
> disregard any line below that says otherwise. Shared test helpers now exist in `src/server/mis/testing/`
> (`ast.ts` source scanner, `wage-world.ts` fake DB + leak detector, `people-world.ts` real org chart); reuse them.
> Findings are asserted as the CORRECT behaviour under `it.fails` (a fix turns the case red — delete the `.fails`).


> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-17.md`](./phase-reports/phase-17.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-18.md`](./phase-reports/phase-18.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 18 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Tickets.** MIS-187 (rebuild all three checklists), MIS-190 (fill a full shift's grid),
MIS-193 (notification reaches everyone it should), MIS-196 (every AQL boundary + a
threshold change), MIS-199 (reject, rework, re-sample, accept), MIS-204 (overlay the
generated COA on the original), MIS-206 (document versioning, permission, retrieval after
rename), MIS-209 (break the storage path deliberately), MIS-212 (trace at three years of
data volume), MIS-219 (time the Owner dashboard on Arjun's device-locked account),
MIS-267 (the attendance report and the payroll engine agree to the rupee). Epic **E7** —
11 tickets, `MIS-187 → MIS-267`.

**Touches.** `src/server/mis/{qc,reports,documents,payroll}.test.ts`,
`src/lib/mis/aql.test.ts` (extend from Phase 5), `docs/qa/quality-walkthrough.md`,
`docs/qa/coa-overlay.md`.

**Note.** MIS-267 is the highest-value test in this phase: it asserts two independently
written code paths — the attendance report and the payroll calculator — produce the same
rupee figure for the same month. That is the kind of disagreement nobody notices until the
client notices. MIS-204, MIS-212 and MIS-219 are manual.

**Model.** `sonnet` (corrected by Phase 14 from `haiku`; see §6). If a test needs a
policy decision to write, record it as the next D-number (§1A) — Phase 14 added D24 and D25.

**Acceptance check.** MIS-196 extends the Phase 5 boundary tests with an effective-dated
threshold change and asserts historical decisions are unmoved. MIS-209 deliberately breaks
the S3/IDrive path and asserts the failure is surfaced, not swallowed. MIS-212 is a
walkthrough with a seeded volume script.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck   # nothing
node_modules/.bin/eslint $(git diff --name-only --diff-filter=ACM | grep -E '\.tsx?$')
pnpm vitest run          # the agent runs this itself (Phase 14)
pnpm build
```

**Prompt.**
```
run phase 18 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Phase 5 must be merged first. Read MIS_UI_SPEC.md and §6 first. Use the Phase 15
factories. MIS-204, MIS-212 and MIS-219 are manual walkthroughs.
MIS-267 is the priority: assert the attendance report and calculateMonthlyPayroll produce
the same figure for the same month from the same fixture.
Tests and docs only. Log bugs to docs/qa/FINDINGS.md.
Model: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-17.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-18.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 18 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 19 · QA · attendance, kiosk and payroll

> ⚠ UPDATED BY PHASE 14F — **payroll is now fit to test; F-01 and F-08 are fixed, F-09 is not.**
> `calculateMonthlyPayroll` is gated on `wages.read` (Owner only) and prices EACH attendance day at the rate in force
> on that day's date (**D27**) — read the rates through `getWageRateHistory` / `getWageRuleHistory` and
> `lib/mis/effective-dated.ts`, never `getRuleValue`. Month bounds are UTC dates. `payroll-figures.test.ts` and
> `rule-history.test.ts` hold hand-worked figures for every status; extend them, do not re-derive. **Still open:**
> F-09 (a second edit of the same rule or rate on the same day hits the unique key — 3 `it.fails`); a month is
> not final and a back-dated rate re-prices its days (D28). The attendance operators no longer see Payroll at
> all — a Phase 19 test that expects them to is asserting the bug.


> ⚠ UPDATED BY PHASE 13 (Half B) — **what exists to build on, and what does not.** Exists: `attendance-punch.test.ts`
> (D15 both directions, exactly-once, out-of-order, night shift, closed-day/unknown-badge/leaver parks,
> hand-edited days, immutability, the tablet door), `attendance-day.test.ts`, `factory-time.test.ts`,
> `kiosk-screen.test.tsx`, and the queue's per-person dependency tests. **Not covered, yours:** a real
> tablet (nothing here ran on a device), payroll's month boundaries (`payroll.ts`, `reports.ts` still bucket
> months on the server's clock — see the Phase 20 stamp), and D23's trust question (an operator naming the
> wrong person). **Still no lateness/overtime rules to test (D20).** Do not "fix" `attendance.ts`'s legacy
> `clockIn`/`clockOut`: they stamp the server's clock and are no longer reached from the kiosk screen.

> ⚠ UPDATED BY PHASE 13 — **MIS-247's lateness and overtime rules do not exist to test.** Nothing
> in the codebase computes `lateMinutes` or `otMinutes` (only `OT_MULTIPLIER` exists, as a rate
> input); Phase 13 deliberately did not invent a grace period (**D20**). Do not write "one named
> test per rule" against rules that are not there — log it in `docs/qa/FINDINGS.md` and test what
> does exist: the punch → day derivation (`attendance-day.test.ts`), the D15 both-directions
> timing, and the immutability trigger (**D21**).

> ⚠ UPDATED BY PHASE 12 — three things to add to your QA. (1) **Wage-leak sweep of the pull:**
> `kiosk-device.test.ts` already asserts the exact key set, a deep key scan for wage/salary/rate/
> pay words, and that only `id, employeeCode, name` are selected from the employee table — extend
> the sweep, do not replace it, and re-run it whenever a column is added to `MisEmployee`.
> (2) **The auth exemption:** `src/lib/mis/kiosk-routes.test.ts`, `src/lib/supabase/middleware.test.ts`
> and `src/app/api/mis/kiosk/kiosk-routes.test.ts` prove an un-tokened request to each kiosk
> route is refused and near-miss paths are still bounced to /login — probe `/api/mis/**` from a
> signed-out browser yourself once. (3) **Staleness thresholds are D19** (30 min / 8 h sync;
> 24 h / 72 h list): check the attendance card's colour and words against them. Untested in real
> life: pairing a real tablet end to end and the retire-wipes-cache path — both need the Expo app.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-18.md`](./phase-reports/phase-18.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-19.md`](./phase-reports/phase-19.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 19 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Tickets.** MIS-234 (a full night shift end to end), MIS-239 (a simulated shift change,
offline, on the real device), MIS-242 (break the sync at every point), MIS-247 (**every
rule in BRD §9.1 as a named test**), MIS-254 (correction windows + the night-shift
register), MIS-259 (check one month against Arjun's own calculation). Epic **E3** —
6 tickets, `MIS-234 → MIS-259`.

**Depends on.** Phases 12 and 13 for the kiosk tickets (MIS-239, MIS-242). MIS-234,
MIS-247, MIS-254 and MIS-259 can run today against built code.

**Touches.** `src/server/mis/{attendance,payroll,kiosk-device}.test.ts`,
`docs/qa/attendance-walkthrough.md`.

**Model.** `sonnet` (corrected by Phase 14 from `haiku`; see §6). If a test needs a
policy decision to write, record it as the next D-number (§1A) — Phase 14 added D24 and D25.

**Acceptance check.** MIS-247 is one named test per rule — lateness threshold, grace
period, OT multiplier, Sunday handling, absence, half-day — each asserting the rule
snapshot, so a later rule change cannot rewrite history. MIS-259 is the reconciliation
walkthrough: one real month, Arjun's own numbers, line by line, difference column. Payroll
tests must not print figures into any shared log.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck   # nothing
node_modules/.bin/eslint $(git diff --name-only --diff-filter=ACM | grep -E '\.tsx?$')
# then, on your Mac — the agent cannot run vitest:
pnpm vitest run src/server/mis
```

**Prompt.**
```
run phase 19 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Read MIS_UI_SPEC.md and §6 first. MIS-247 is the core: one named test per attendance /
payroll rule, each asserting the rule snapshot so a later change cannot move a recorded
figure. MIS-239 and MIS-242 need Phases 12 and 13 merged — skip and say so if they are not.
MIS-259 is a reconciliation walkthrough document, not a unit test.
Salary figures must not be written into any test output that is committed.
Tests and docs only. Log bugs to docs/qa/FINDINGS.md.
Model: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-18.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-19.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 19 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 20 · QA · store/PO, scheduling and platform

> ⚠ UPDATED BY PHASE 14F — the payroll month bounds (`payroll.ts`) are now UTC dates and are OFF your sweep list
> (tested under TZ=Asia/Singapore). `addWageRate` and `createRuleRevision` still default `effectiveFrom` to the
> server clock — add them.
> ⚠ UPDATED BY PHASE 14 — **(1)** F-06: `getStoreReport` sends `pricePerUnit` and raw transactions to four
> non-Owner roles (D24); PO rates and `MisItem.pricePerUnit` on the item screens were not checked — check them.
> **(2)** No Phase 14 test tripped over a server-local site, but the payroll month bounds (`payroll.ts:24-25`) are
> on your sweep and are not exercised by the fake. **(3)** Adding a server function means adding it to
> `server-gates.test.ts` (`REVIEWED_UNGATED` if it opens with anything but a gate) — that test fails on purpose.
> Also: Phase 14 proved `pnpm vitest run` **runs in the agent shell** and that QA phases run on **sonnet** —
> disregard any line below that says otherwise. Shared test helpers now exist in `src/server/mis/testing/`
> (`ast.ts` source scanner, `wage-world.ts` fake DB + leak detector, `people-world.ts` real org chart); reuse them.
> Findings are asserted as the CORRECT behaviour under `it.fails` (a fix turns the case red — delete the `.fails`).


> ⚠ UPDATED BY PHASE 13 — **this phase must also run a timezone sweep (D22).** The punch, attendance-day,
> shift-window and kiosk-pull paths now resolve every day through the `factory.timezone` rule
> (`src/lib/mis/factory-time.ts`). Everything else in the MIS still buckets by the SERVER's clock, and the
> database (UTC+8) and the plant (IST) are 2.5 hours apart. The load-bearing sites — where an instant is
> turned into a day, month or hour — are: `production.ts` `getDayProductionSummary`; `orders.ts` `startOfToday`;
> `qc.ts` `getTodayQcBoard` (`getHours` slots, `nowMinutes`) and `qc/grid/page.tsx`; `worker-allocation.ts`
> `atMidnight`; `store.ts` (~478); `payroll.ts`/`reports.ts` month bounds via `attendance/`, `payroll/`,
> `reports/` and `print/payslip` pages (`getFullYear`/`getMonth`); the `(mis)/page.tsx` greeting and
> "yesterday"; and the document-number generators in `orders.ts`/`po.ts`/`grn.ts` (year-month). About a
> hundred more are display-only `toLocale*('en-IN')` calls that read the viewer's zone and can mismatch on
> hydration. Do not touch payroll figures without a hand-checked fixture (money). Use `factoryDateKey`,
> `factoryMinuteOfDay`, `formatFactoryTime` and `dateKeyToDbDate`; never `getHours`/`setHours`.

> ⚠ UPDATED BY PHASE 8 — **this phase must also run a placeholder-wiring sweep.** Phases 6, 7
> and 8 each independently found one UI element bound to plausible-but-wrong data: the QC card
> on the supervisor home, a `.catch(() => [])` that made "not gated" display on a gated order,
> the Crew bottom-nav tab pointing at `/mis/attendance`, its badge showing clock-out approvals,
> and "My crew today" showing the whole factory instead of the supervisor's subtree. Three
> phases, five findings — this is systematic drift from when the role homes were built fast,
> not bad luck, and finding one per phase is slower and less reliable than one sweep.
> Sweep every nav tab href, every badge count, and every card on the six role homes
> (`src/components/mis/home/*.tsx`) plus `bottom-nav.tsx`: for each, name the server function
> it calls and confirm that function answers the question the label asks. Report a table of
> element → source → verdict. A card that is merely *plausible* is a finding, not a pass.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-19.md`](./phase-reports/phase-19.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-20.md`](./phase-reports/phase-20.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 20 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Tickets.** MIS-279 (partial-receipt arithmetic, approval chain and RBAC — **includes the
six buffer-stock PO cases from `CHANGE_PO_WITHOUT_BOM.md` §4**), MIS-98 (machine
allocation concurrency, overlap, cross-department visibility), MIS-264 (worker
availability, overlaps, pool boundaries), MIS-266 (the allocation↔job-card seam holds),
MIS-81 (touch-target audit + component tests), MIS-84 (install + offline shell on a real
device), MIS-87 (offline, reconnect and duplicate-submit), MIS-89 (prove the CI gates
actually block), MIS-93 (rehearse a rollback + smoke checklist).
Epics **E9 / E4 / E8**.

**Touches.** `src/server/mis/{po,grn,store,machines-board,worker-allocation}.test.ts`,
`src/components/mis/kit/*.test.tsx`, `docs/qa/store-walkthrough.md`,
`docs/qa/release-smoke.md`.

**Note.** MIS-279's six buffer-stock cases are already written out in
`CHANGE_PO_WITHOUT_BOM.md` §4 — copy them, do not re-derive them: buffer PO end to end,
`FOR_ORDER` with an empty ref refused, a stale ref stripped on switching purpose,
classification-on-issue, no surface renders a buffer PO as incomplete, and legacy
`bom_ref IS NULL` rows read as buffer stock. MIS-81's touch-target audit is mechanical —
every interactive element ≥ 44px, checked against `01-Foundations.png`.

**Model.** `sonnet` (corrected by Phase 14 from `haiku`; see §6). If a test needs a
policy decision to write, record it as the next D-number (§1A) — Phase 14 added D24 and D25.

**Decisions.** Two apply here, both cited rather than restated. **D1** fixes where
buffer-stock cost lands and when an order's material cost is recognised — every costing
assertion in MIS-279 is written against D1, so if D1 changes, this phase is re-run and
nothing else is. **D4** fixes the pool boundaries MIS-98 and MIS-264 test. Read both in
[`DECISIONS.md`](./DECISIONS.md).

**Acceptance check.** Partial-receipt arithmetic tested to the paisa: order 100, receive
40 then 35, short-close at 75, assert outstanding, ledger and PO status at each step.
Costing assertions follow **D1**: a buffer PO posts to the general pool and costs no order
until the stock is issued.
MIS-89 and MIS-93 are walkthroughs against `docs/11-deployment-plan.md`.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck   # nothing
node_modules/.bin/eslint $(git diff --name-only --diff-filter=ACM | grep -E '\.tsx?$')
# then, on your Mac — the agent cannot run vitest:
pnpm vitest run src/server/mis src/components/mis
```

**Prompt.**
```
run phase 20 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Read MIS_UI_SPEC.md (especially §5 and §6), §6 of this guide, and
Arjun/app/docs/CHANGE_PO_WITHOUT_BOM.md §4 — MIS-279's six buffer-stock cases are already
written there, copy them rather than re-deriving them.
Read D1 and D4 in Arjun/app/docs/DECISIONS.md and cite them — D1 for every costing
assertion, D4 for MIS-98 and MIS-264's pool boundaries. Never retype a decision's value
into a test name or an assertion message.
MIS-84, MIS-89 and MIS-93 are manual walkthroughs.
Tests and docs only, no application code. Log bugs to docs/qa/FINDINGS.md.
Model: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-19.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-20.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 20 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 21 · PO decisions — implements D1, D2 and D3

> ⚠ UPDATED BY PHASE 14 — **D24 (who may see material rates and prices) is undecided and sits under D1/D2.**
> A PO's rate lines are money; today `po.read` holds STORE_GUY and ADMIN. Decide D24 together with D2 (approval
> level) and add the PO reads to the F-06 tests. `getPendingApprovals` also returns POs to roles without `po.read` (F-13).


> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-20.md`](./phase-reports/phase-20.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-21.md`](./phase-reports/phase-21.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 21 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite `D1`–`D4` from [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** Implement **D1, D2 and D3** as they stand in
[`DECISIONS.md`](./DECISIONS.md), and close the last open risk from the PO-without-BOM
change.

**Tickets.** MIS-275 (E9-02 BE · PO model and **configurable approval chain** — currently
PARTIAL: `submitForApproval`/`approvePO` exist but are single-step, not the designed
`OWNER_ONLY | ADMIN_ONLY | BOTH`), MIS-295 (E9-07 · raise a buffer-stock PO, created by
the change note). Epic **E9**.

**Not blocked any more.** Earlier drafts held this phase until Arjun replied. He has
chosen defaults instead, and they are D1–D3 in `DECISIONS.md`. Build exactly those, cite
the D-numbers, and **build nothing beyond them** — an approval rule Arjun has not asked for
is exactly the rework this plan exists to prevent. Read all three before you start; two of
them mean *less* code, not more.

| Decision | What this phase builds |
|---|---|
| **D1** — cost is recognised at issue; buffer POs post to a general pool | The **buffer-drift report** in `reports.ts`: value received on `BUFFER_STOCK` POs vs value issued `FOR_ORDER`, so the gap D1 knowingly accepts is visible monthly rather than at year end. |
| **D2** — identical thresholds, no special rule | MIS-275's configurable approval chain with **one** threshold table for every PO. **Purpose is not an axis.** No `purpose` column in the threshold lookup, no second code path. |
| **D3** — "PO" is the supplier PO; the customer's is "Customer PO" | A **screen-copy rename only.** No model renames, no column renames, no route changes. |

**Touches — D2's approval chain.**
- `prisma/migrations-pending/20260915000000_mis_po_purpose/` — **promote this migration**.
  It already exists, written and unapplied, with its rollback. Its whole purpose was to
  let SQL filter and group on purpose, which is what a purpose-aware threshold needs.
  `CHANGE_PO_WITHOUT_BOM.md` §6 says apply it only when this moment arrives. This is it.
- `src/server/mis/po.ts` — `approvalMode` + a single threshold table. Per **D2**, purpose
  is **not** a second axis; the migration is promoted so SQL can filter and group on
  purpose for D1's report, not so the approval rule can branch on it
- `src/server/mis/business-rules.ts` — seed the thresholds, effective-dated
- `src/components/mis/approvals/approvals-screen.tsx` — threshold-aware queue

**Touches — D1's drift report.** `src/server/mis/reports.ts` — a buffer-stock drift report:
value received on `BUFFER_STOCK` POs vs value issued `FOR_ORDER`. `reports.ts` has no PO
surface at all today, so whoever builds it must bucket buffer-stock POs as their own group
— an "unassigned" label would reintroduce the exact assumption Arjun asked us to drop.

**Touches — D3's rename pass.** Screen copy only: customer PO → "Customer
Order", supplier PO → "Purchase Order". No model renames, no route changes.

**Model.** **`opus`.** Approval thresholds are money control; the migration runs against
live rows (12 POs, 2 already `bom_ref IS NULL`); and D1's drift report has to reconcile two
independently written ledgers. This is the last genuinely hard work in the plan. If Arjun's
real answers arrive and differ from D1–D3, they arrive as prose that has to be turned into
rules — also `opus`, also this phase.

**Acceptance check.**
- The CHECK constraint keeping `purpose` and `bom_ref` in step is applied and the backfill
  is verified against the live rows before and after.
- A threshold change is effective-dated and never re-opens a PO already approved.
- Per **D2**, a buffer-stock PO and an order-linked PO of the same value take the **same**
  approval path. A test asserts that explicitly, so a future purpose-aware rule cannot be
  added by accident.
- Per **D1**, the drift report buckets buffer-stock POs as their own group. An "unassigned"
  label is a fail — it reintroduces the exact assumption Arjun asked us to drop.
- No PO surface anywhere renders a buffer-stock PO as an error, a warning, or an
  incomplete record — re-run the MIS-279 cases from Phase 20 to prove it.

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/po.ts src/server/mis/reports.ts src/components/mis/approvals/approvals-screen.tsx
# on your Mac:
pnpm vitest run src/server/mis/po.test.ts
pnpm build
```

**Prompt.**
```
run phase 21 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Read Arjun/app/docs/DECISIONS.md D1, D2 and D3 in full first — they are ASSUMED but
decided, so build exactly them and cite the D-numbers. D2 means ONE threshold table for
every PO: purpose is not an axis of the approval decision, so do not build a purpose-aware
threshold. D3 is screen copy only: no model, column or route renames.

Then read Arjun/app/docs/CHANGE_PO_WITHOUT_BOM.md in full, then MIS_UI_SPEC.md §6.
Promote prisma/migrations-pending/20260915000000_mis_po_purpose — it is already written;
verify its backfill against the live rows rather than rewriting it.
SCHEMA GATE applies. Then MIS-275 and MIS-295 one ticket at a time, build then check.
Model: opus. Checkers: haiku.

Follow the Phase Contract in §1A of the guide. FIRST, before any work: read §1A, this
phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and Arjun/app/docs/phase-reports/phase-20.md (the previous phase's report)
Apply anything marked pending before your own tickets. LAST: write
Arjun/app/docs/phase-reports/phase-21.md (that exact filename — do not invent one), append
exactly one row to Arjun/app/docs/PHASE_LOG.md, and if you learned anything that changes a
later phase, edit that phase's section in the guide and stamp it "UPDATED BY PHASE 21 — ...".
Assumed values are in Arjun/app/docs/DECISIONS.md — cite D1-D4, never restate a value.
Report back in 150 words or fewer, ending with the exact file list for the next phase.
```

---

### Phase 23 · The parked-writes inbox — **added by Phase 10**

> ⚠ UPDATED BY PHASE 14 — **a new permission or server function breaks four pinned tests on purpose.** Adding an
> action to `permissions.ts` fails the hand-written matrix in `lib/mis/permissions.test.ts` (33 actions) until it is
> added there; a new exported function fails `server-gates.test.ts` unless it opens with a gate. Gate the inbox
> per KIND by that kind's own read permission — F-13 is exactly the mistake of one permission over three kinds of
> data. Run `permission-matrix.test.ts`'s completeness check for any module you add.


> ✔ NUMBERING RESOLVED — this inbox was "Phase 22" when Phases 10 and 11 were written; the
> human renumbered it to **23** (Phase 22 is *Unclaimed gaps*, Phase 24 is the desktop layer).
> Older prose that says "Phase 22" about the parked-writes inbox — PHASE_LOG rows 10 and 11,
> `phase-reports/phase-10.md` and `phase-11.md` — means **this** section and is history, not
> to be edited.

> ⚠ UPDATED BY PHASE 13 — **punch parks, and what the inbox now inherits.** Punches park for five reasons
> and none is retryable (D17, D21): `BADGE_UNKNOWN`, `EMPLOYEE_INACTIVE`, `CORRECTION_WINDOW_CLOSED`,
> `CLOCK_SKEW`, `TOO_OLD` (+ `PREDECESSOR_PARKED`). (1) A `BADGE_UNKNOWN` park may already be **resolved**
> — the tablet's Fix (D23) re-records the punch and stamps the held row's `resolvedAt`/`resolutionNote` —
> so list only rows with `resolvedAt` null. (2) **You build the audited override for the other four**: it
> must apply the punch through the same path as any other (`applyPunch` inside `runIdempotent`, so the
> correction window and clock tolerance are a decision a named person overrides on the record, not a
> bypass) — extract it rather than copying it. (3) **Correcting an applied punch is not built**: the table
> supports it (`supersedesId`, `correctionReason`) and the trigger forbids the alternative, but no
> function writes a correction row yet. That, plus a "punches behind this day" view (`punches` are
> derived-from, not shown anywhere), is yours. (4) `correctsKey` on a punch payload closes a
> parked `BADGE_UNKNOWN` only for the same device/user; do not widen it.

> ⚠ UPDATED BY PHASE 11 — part of your Retry work is done. **A person can already retry a
> park that a changed world can fix** — `ORDER_CLOSED`, `PHASE_SIGNED_OFF`, `PHASE_NOT_ACTIVE`,
> `PHASE_AMBIGUOUS`, `FORBIDDEN`, `UNKNOWN` (`RETRYABLE_PARK_REASONS`, **D17**) — via the sync
> indicator's Retry button, which is shown only when `canRetry(item)` holds and is re-checked
> on the server. **What is still yours:** clearance and clock parks (`CLEARANCE_EXPIRED`,
> `LINE_NOT_CLEARED`, `CLOCK_SKEW`) deliberately have **no** retry, because a re-tap must not
> stand in for the audited override — you build that override as its own gated, reasoned,
> audited server function (the parked payload is kept for exactly this), plus the
> cross-device inbox. Parked-then-released rows get `resolvedById/At/Note` set by
> `runIdempotent`. This phase has no Jira ticket — create one before starting.

> **📎 Phase Contract — §1A applies to this phase.**
> _First task:_ read §1A, the tail of [`PHASE_LOG.md`](./PHASE_LOG.md), and the previous
> report [`phase-reports/phase-22.md`](./phase-reports/phase-22.md). **Apply anything marked
> pending before your own tickets.**
> _Last task:_ write [`phase-reports/phase-23.md`](./phase-reports/phase-23.md) (that exact
> filename), append **one** row to `PHASE_LOG.md`, and if you learned anything that changes a
> later phase, **edit that phase's section here and stamp it** `⚠ UPDATED BY PHASE 23 — …`.
> Report to the human in **≤150 words**, ending with the file list for the next phase.
> Assumed values: cite the D-numbers in [`DECISIONS.md`](./DECISIONS.md); never restate one.


**Goal.** Somewhere for a human to see and resolve every write the offline queue parked,
including ones from a tablet nobody is holding.

**Tickets.** None yet — this phase exists because **Appendix B §B.7** requires it and no
ticket was ever written for it. Raise one in E8 before starting, and record its key here.

**Why it exists.** Phase 10's contract parks a write that was legal when queued and illegal
on arrival, and records it server-side with its payload precisely so it survives the device.
Phases 11 and 13 surface parks *on the device that made them* — the sync indicator and the
kiosk queue. Neither answers "is anything stuck anywhere in the factory?", and neither helps
when the tablet is lost, wiped or in a drawer. **A queue with no inbox is a silent drop with
extra steps.**

**Touches.**
- `src/lib/mis/permissions.ts` — new `queue.review` action (OWNER, ADMIN, and
  SUPER_ATTENDANCE_OPERATOR for punch kinds)
- `src/server/mis/idempotency.ts` — list/resolve/discard functions on top of Phase 10's
  storage
- `src/app/(mis)/mis/queue/page.tsx` + `src/components/mis/queue/parked-writes-screen.tsx`
  — **new**
- `src/components/mis/home/*-home.tsx` — a count where it belongs (Owner and Admin homes)

**Model.** `sonnet`. Appendix B already decided the semantics; this is a list, a detail view
and three resolve actions that call functions Phases 10–13 already built.

**Acceptance check.**
- Each row shows the **payload as submitted**, the **reason** (code and sentence) and the
  **evidence**: `clientRecordedAt`, device, actor, attempts. A clearance park additionally
  shows the clearance in force then beside the one in force now (§B.5.1).
- **`queue.review` alone can see and discard-with-a-reason, never apply.** Applying past a
  park needs the underlying right as well — `clearance.write`, an Owner's `phase.reopen`, or
  `orders.write` to reopen a closed order (§B.5.1, §B.5.2, §B.5.4).
- Every resolution is audited, and a discard records its reason.
- Resolving the blocker on a `PREDECESSOR_PARKED` chain releases the whole chain (§B.6).
- An empty inbox is a real state with a sentence, not a blank (`08-Empty-error-offline.png`).

**Verify.**
```bash
cd Arjun/app
node_modules/.bin/tsc --noEmit --skipLibCheck
node_modules/.bin/eslint src/server/mis/idempotency.ts src/components/mis/queue
pnpm vitest run src/server/mis/idempotency.test.ts
```

---

## 7. Token discipline — the rules that make this cheap

This project is being finished by cheap models. That only works if the context each
session carries is small and deliberate. These are the rules; they are not suggestions,
and every agent definition in `.claude/agents/` repeats them.

1. **Read `MIS_UI_SPEC.md`. Do not explore the codebase.** The spec exists because
   exploring costs ten times what reading costs and produces worse answers. An agent that
   opens twenty files to learn the conventions has already spent the phase's budget. If
   something genuinely is not in the spec, add it to the spec rather than exploring twice.
2. **One phase per session.** Start fresh. A session that has already done a phase is
   carrying context that is now dead weight, and it will make the next phase both more
   expensive and worse.
3. **One ticket per build agent, then stop.** The build agent implements a single ticket
   and returns. It does not "also fix" the thing next to it. Scope creep inside an agent
   is invisible and unreviewable — which is precisely how the first round of rework
   happened.
4. **Agents write artifacts to disk and return a summary of 200 words or fewer.** Code
   goes in files. Findings go in `docs/qa/FINDINGS.md`. Logs go in their own file. What
   comes back into the conversation is a verdict and a file path.
5. **Never paste file contents into chat.** Not to show progress, not to confirm a change,
   not "here is the final version". Cite `path:line`. The person can open it; the model
   does not need to re-read it.
6. **Batch independent tool calls.** Four greps that do not depend on each other go in one
   message, not four round trips. Same for reads.
7. **Cheap model by default.** `haiku` unless this guide says otherwise. `opus` appears in
   exactly four phases (2, 7, 10, 21) and each one says why. If a `sonnet` phase hits a
   genuine design question, **stop and escalate to the person** — do not upgrade yourself
   mid-phase, and do not guess.
8. **The checker runs on the cheapest capable model.** Checking is comparison against a
   written acceptance list. It does not need a strong model; it needs a fresh one that did
   not write the code.
9. **Never re-verify what the verify command already proved.** If `tsc` printed nothing,
   the types are fine. Do not read the files again to be sure.
10. **Do not summarise this guide back to the person.** They have it open.
11. **Read §2A before debugging anything.** Every environment failure in this project is
    already written down with its fix. Working one out from first principles costs a
    session and reaches the same answer.
12. **Cite a D-number, never a decision's value.** `DECISIONS.md` is the only place a value
    lives. A value copied into a phase, a comment or a test name is a value that will be
    wrong the day Arjun answers.
13. **The Phase Contract (§1A) is part of every phase's cost estimate.** Reading the log and
    the previous report is three minutes; rediscovering what the previous phase learned is
    an hour.

---

## 8. The build/check pair

Four agents live in `app/.claude/agents/`. Every build phase runs them as a pair, one
ticket at a time:

| Agent | Model | Role |
|---|---|---|
| `mis-fe-build` | sonnet | Implements one FE ticket against `MIS_UI_SPEC.md` + the screenshot. Stops. |
| `mis-fe-check` | haiku | Independently verifies that ticket. Read-only. PASS/FAIL. |
| `mis-be-build` | sonnet | Implements one BE ticket. Stops. |
| `mis-be-check` | haiku | Independently verifies it. Read-only. PASS/FAIL. |

The checkers have no write tools, on purpose. A checker that can fix what it finds stops
being a check and becomes a second, unreviewed author. On FAIL, the build agent is re-run
with the checker's findings; the checker is never asked to "just fix it".

The checkers work from §2A as their symptom list — every failure mode below has its literal
error text and its fix there. They look for the five this codebase has actually produced:
design drift from the approved screenshots, Prisma `Decimal` crossing into a client
component, a `'use client'` file importing a server module by value, a missing permission
guard on an exported server function, and wage or salary leaking to a non-OWNER surface or
into an audit payload.

---

## 9. Coverage check

The 92 unbuilt tickets, accounted for: Phase 0 covers none (board only). Phases 1–13 cover
the 38 build tickets — E1 9, E2 3, E8 3, E4 5, E6 9, E7 3, E3 6. Phases 14–20 cover all
54 QA tickets — E1 7, E2 2, E8 6, E4 3, E5 9, E6 9, E7 11, E3 6, E9 1. Phase 21 covers
MIS-275 (PARTIAL, not in the 92) and MIS-295 (created after the inventory).

Every ticket key in this guide is quoted from `TICKET_INVENTORY.md` or, for MIS-295, from
`CHANGE_PO_WITHOUT_BOM.md` §4. None was invented.

Also worth knowing, though not in the 92: **54 PARTIAL tickets** remain across E2, E5, E6,
E7, E8, E9. Phase 0 marks them In Progress with their gap on the ticket. Several are
closed as a side effect of the phases above (E6-01 by Phase 7, E7-05 by Phase 5, E8-03 by
Phase 10, E4's utilisation metric by Phase 9). The rest — BOM versioning, job-card
templates, customer-PO capture, document versioning, machine utilisation, batch/lot
tracking — are a second pass to scope once these 22 phases are through, and they should be
re-inventoried rather than assumed.

---

## 10. The two project skills

Both were proposals in an earlier draft. **Both now exist**, in
`app/.claude/skills/`, and VS Code Claude Code loads them automatically from there — you
do not invoke them, you do not paste them, and you do not repeat their contents in a prompt.

| Skill | File | When it fires |
|---|---|---|
| `mis-schema-gate` | `.claude/skills/mis-schema-gate/SKILL.md` | Any phase that adds or alters a Prisma model, column or foreign key — **Phases 1, 4, 6, 7, 8, 9, 10, 12**. Eight of the twenty-two. |
| `mis-permission-matrix` | `.claude/skills/mis-permission-matrix/SKILL.md` | Verifying a role end to end, and generating the table-driven suite over all eight roles — **every QA phase, 14–20**, and any new server module. |

`mis-schema-gate` exists because `prisma generate` and `prisma migrate` cannot run in the
agent shell (§2A.2), so a schema change has to be split across two sessions with a human
command in between. Getting that split wrong wastes a whole session on code that cannot
compile. The convention was already in the repo
(`prisma/migrations-pending/20260915000000_mis_po_purpose/`); nothing told an agent to
follow it. Now something does.

`mis-permission-matrix` exists because all seven QA phases produce the same test shape, it
is the single highest-value test in the project, and it carries the wage rule: wages and
salary are OWNER-only and must never reach another role's screen, query, export or audit
payload. Written once, the eighth one is free.

**They do not duplicate the `bpp-mis` skill.** That one carries the design system, the
server signatures, the role map and the verify command. These two carry procedures it does
not cover. If you find yourself explaining either procedure in a prompt, the skill is not
loading — check the folder name matches the `name:` in its frontmatter.

---

---

## Appendix A — phase transition table

> **Written by Phase 7 (2026-09-19).** **Phase 11** re-checks these transitions at replay
> time and **Phase 17** writes one named test per *illegal* transition below. This table is
> the specification: if the code and this table disagree, the code is wrong.

### A.1 What a phase is

`MisJobPhase` is an **execution** row: one process, once, on one order, with a status, an
in-charge and a signature. It is **not** `MisBomStage` — that is the *plan* (which
materials, in what order), it hangs off a BOM the Owner approves, and conflating the two
would put execution state on a row that BOM editing rewrites. A phase may carry
`bomStageId` as a back-pointer to the plan row it came from; it is nullable and nothing
gates on it.

**The order is the job card** (D9). MIS-145 names the column `jobCardId`; there is no
`MisJobCard` model and never was — `/mis/print/job-card/[id]` takes an order id. The column
is therefore `orderId`.

**Sequence** is the position on the BPR's *Work flow* checkbox row, which is the client's
own ordering of its eleven processes: Board Trimming · Printing · Lamination · Coating ·
Corrugation · Die Cutting · Blanking · Sorting · Window Pasting · Foiling · Pasting
(`Batch Production Record_BPP.pdf`, p1). Five of those eleven are **already** in the live
process master under the client's own codes (Printing `PROC-003`, Lamination `PROC-005`,
Coating `PROC-004`, Die Cutting `PROC-001`, Foiling `PROC-007`), alongside thirteen more
the client uses. **Seed only the six that are missing** — Board Trimming, Corrugation,
Blanking, Sorting, Window Pasting, Pasting — matched by name, at the next free codes from
`PROC-020`. Do not re-seed eleven; you would duplicate five real masters. Do not reuse
`PROC-008`, which is a gap in the live sequence.

### A.2 States

| State | Means | Terminal? |
|---|---|---|
| `PENDING` | Declared on the job card, not started. The default for every phase. | no |
| `IN_PROGRESS` | Started. Production may be recorded against it. | no |
| `SIGNED_OFF` | The in-charge has signed. The next phase is startable. | yes, except Owner reopen |
| `NOT_APPLICABLE` | Not part of this job's route — an unticked box on the BPR work flow. Skipped when finding "the previous phase". | yes, except Owner/Admin restore |
| `REOPENED` | Was signed, then reopened by the Owner. Work may continue; the signature is withdrawn. | no |

**`REOPENED` is deliberately not `IN_PROGRESS`.** MIS-142 says reopening "returns it to
IN_PROGRESS" and MIS-145 lists `REOPENED` as a status; both are satisfied by making
`REOPENED` behave exactly like `IN_PROGRESS` for every gate, while remaining distinct in
the record. A phase that was signed once and reopened must never again be indistinguishable
from one that was never signed — that distinction is the whole value of the signature.

### A.3 The transition table

`✗` = illegal, always, for everybody. The server module refuses it **and** the database
refuses it.

| From → To | `PENDING` | `IN_PROGRESS` | `SIGNED_OFF` | `NOT_APPLICABLE` | `REOPENED` |
|---|---|---|---|---|---|
| **`PENDING`** | ✗ | `startPhase` | ✗ | `markNotApplicable` | ✗ |
| **`IN_PROGRESS`** | ✗ | ✗ | `signOffPhase` | `markNotApplicable`¹ | ✗ |
| **`SIGNED_OFF`** | ✗ | ✗ | ✗ | ✗ | `reopenPhase` |
| **`NOT_APPLICABLE`** | `restorePhase`² | ✗ | ✗ | ✗ | ✗ |
| **`REOPENED`** | ✗ | ✗ | `signOffPhase` | ✗ | ✗ |

¹ Only while **no production entry exists** against the phase — the "started by mistake"
case. Once work is recorded you cannot un-happen it; sign it off or reopen it.
² Only while **no later phase has started** — otherwise restoring would open a hole behind
work already done.

**A transition to the state a phase is already in is refused**, with its own reason code
(`ALREADY_IN_STATE`), not silently accepted. Phase 11: that code is your replay signal — a
re-delivered sign-off that returns `ALREADY_IN_STATE` has already succeeded and should be
retired from the queue, not parked.

### A.4 Who may perform each transition

Role gates are new actions in `src/lib/mis/permissions.ts`. Identity checks sit **on top
of** the role gate: the role answers *may you sign off phases at all*, the identity answers
*may you sign off this one*.

| Transition | Role gate | Identity rule |
|---|---|---|
| `startPhase` | `phase.write` — OWNER, ADMIN, SUPERVISOR | the in-charge, or any ADMIN/OWNER. If the phase has no in-charge, the actor becomes it. |
| `signOffPhase` | `phase.write` | **the in-charge, and nobody else — not ADMIN, not the Owner.** A signature someone else can apply is not a signature. |
| `markNotApplicable` | `phase.write` — ADMIN, OWNER only | routing is a planning act, not a shop-floor one. Reason required. |
| `restorePhase` | `phase.write` — ADMIN, OWNER only | reason required. |
| `reopenPhase` | `phase.reopen` — **OWNER only** | reason required. Flags downstream phases; never cascades a status change onto them. |
| `reassignInCharge` | `phase.write` — ADMIN, OWNER only | the answer to "the signer left" (D12). Audited, and the outgoing in-charge is recorded. |
| `getPhasesForOrder` | `phase.read` — OWNER, ADMIN, SUPERVISOR, QC | — |

**Why `reassignInCharge` has to exist.** Of the sixteen OWNER/ADMIN/SUPERVISOR employees in
the live database, **three have a login** and **three have a department**. "Only the
in-charge may sign" plus an in-charge who cannot log in is a permanently stuck job card, and
a stuck gate is what produces the paper workaround this whole feature exists to kill. For
the same reason the in-charge default is **the person who started the phase**, not a lookup
through `MisProcess.departmentId` → department supervisor: that lookup resolves to nobody
for almost every process in the real data.

### A.5 The sequential gate

> A phase may enter `IN_PROGRESS` only when the previous phase **whose status is not
> `NOT_APPLICABLE`**, by `sequence`, is `SIGNED_OFF`. A phase with no applicable predecessor
> is startable. `REOPENED` is **not** signed off and therefore blocks.

This is the BPR's own second rule, printed on page 1 of the client's form: *"Section
receiving BPR should not accept BPR if it is not signed by previous section."*

**Refusal messages name the blocking phase and its in-charge** (MIS-146) — "Lamination is
still with Vali Sah" and not "phase not ready". A refusal with no next action produces a
phone call, and enough phone calls produce a workaround.

### A.6 Sign-off preconditions

All enforced in `signOffPhase()`, all refusing individually and by name:

1. **At least one production entry** against the phase.
2. **Every production entry with `qtyWaste > 0` carries a waste reason** (D11).
3. **Every `FAIL` QC check on the phase is acknowledged** — acknowledged, *not* resolved.
   Acknowledgement records that the in-charge knew and passed the job on anyway, which is
   precisely the accountability the paper form loses.
4. **The caller is the in-charge.**
5. **The timestamp is the server's `now()`.** No argument, no field, no offline exception
   carries a sign-off time.

   > ⚠ CORRECTED BY PHASE 10 — this point used to continue *"Phase 11: a queued sign-off is
   > stamped when it replays"*, which assumed sign-off would be offline-capable. **It is
   > not.** Appendix B §B.1 excludes it: the signature is a claim about the totals shown
   > above the button, and offline those totals are missing every entry another device has
   > not synced yet, so the screen would be asking someone to sign a number it cannot vouch
   > for. Sign-off requires a live connection. The server-stamped rule above stands
   > unchanged and is now the general rule for every server-stamped kind (Appendix B §B.4).

### A.7 The second line of defence — in the database

MIS-146 requires the gate to survive a direct SQL write. The server module is not enough;
these ship in the same migration:

| Mechanism | Rule it enforces |
|---|---|
| `UNIQUE (order_id, sequence) WHERE deleted_at IS NULL` | Two phases at the same position is a corrupt job card (MIS-145). |
| `CHECK` — status ⇒ its evidence | `SIGNED_OFF` requires `signed_off_at` **and** `signed_off_by_id`; `NOT_APPLICABLE` requires a reason; `REOPENED` requires a reason; anything past `PENDING` requires `started_at`. A hand-written insert cannot manufacture a signature with no signer. |
| `TRIGGER mis_job_phase_gate` (BEFORE INSERT OR UPDATE) | §A.5 itself. A `CHECK` cannot see sibling rows, so the sequential gate must be a trigger. This is what catches the seed script, the migration, the bulk import and the code path nobody remembered. |

### A.8 How this composes with D7 and D8 — three gates, none wrapping another

> **⚠ UPDATED BY PHASE 11 — this is now five checks, not three.** `createProductionLog()` runs
> them in this order: permission → **machine named** (D8; a missing `machineId` is a
> `REJECTED` write, never a guess) → **order open** (D14; a closed order refuses production and
> parks a queued write as `ORDER_CLOSED`) → line clearance (D7) → phase gate. The body below
> is otherwise unchanged and still correct: each check answers one question and none wraps
> another. D14's `reopenOrder` is the way back through the order check, exactly as
> `reopenPhase` is for the phase check.

`logProduction()` passes three independent checks, in this order:

1. `requirePermission('production.write')`;
2. `assertLineCleared(machineId)` — **D7**, scoped to the *machine*, unchanged by this phase;
3. the phase gate — scoped to the *order*.

`job-phases.ts` never calls `assertLineCleared`, and `line-clearance.ts` never reads a
phase. They answer different questions (*is this machine fit to run* vs *is this order's
route at this step*) and are deliberately not composed into one super-check, which would
make either impossible to change alone.

**Attribution.** `MisProductionLog.jobPhaseId` (nullable) is resolved server-side:

- explicit `jobPhaseId` → verified to belong to the order and to be active;
- otherwise, the order's active (`IN_PROGRESS`/`REOPENED`) phases: exactly one → use it;
  none → refuse, naming the phase to start and its in-charge; more than one → refuse as
  ambiguous, naming the candidates.

Because it resolves on the server, **no screen has to change** and D8's required `machineId`
is untouched. A reopened earlier phase running alongside a later one is the only way to get
two active phases, and that case refuses rather than guessing.

**Orders with no phases are not gated at all** (D10). Fifteen orders, seven BOMs and thirty
BOM stages already exist in the live database with no phases; gating them would stop
production on day one for every job card nobody has planned yet.

**An ungated order must say so.** The order detail screen shows **`No phase plan · not
gated`** whenever the order has zero phases — neutral tone, next to the status, not hidden
in a tab. A silent bypass reads as a passed gate, and a gate you cannot tell is off is
worse than no gate at all, because people trust it. This is a Half B acceptance criterion,
not a nicety: `getPhasesForOrder()` returning an empty list is a *state the screen renders*,
never a blank.

---

## Appendix B — offline write contract

> **Written by Phase 10 (2026-09-19).** **Phase 11** (offline production entry) and
> **Phase 13** (kiosk punch ingestion) implement this contract and must not invent a second
> queue or a second key scheme. Where this appendix and the code disagree, the code is
> wrong.

The one sentence the rest of this appendix elaborates:

> **A queued write passes exactly the same gates as a live one. When it fails those gates
> it is parked in front of a human, with its reason and its evidence — never dropped,
> never forced through, never quietly corrected.**

### B.1 What may be queued — and what may never be

A write may be queued **only if its correctness does not depend on data the device cannot
see while offline.**

| Write | Queueable? | Why |
|---|---|---|
| Production log (`logProduction`) | **yes** | Its inputs are all in the operator's hand: machine, order, quantity, waste. |
| Kiosk punch, in and out | **yes** | A badge scan is a local event. `K2-Offline-sync-queue.png` is the design for exactly this. |
| Wastage reason (D11) | **yes** | Free text attached to a row that is already queued or already exists. |
| **Phase sign-off** | **no** | The signature is a claim about totals shown *above the button* (Appendix A §A.6, MIS-164). Offline, those totals are missing every entry another device has not yet synced, so the screen would ask someone to sign a number it cannot vouch for. |
| Clear the line (D7) | **no** | A clearance certifies a machine was verified *now*. Queuing one means certifying the past from the present. |
| Approvals, BOM approval, wage or rate edits, anything under `wages.read` | **no** | Money and authority. Both need the current state of the world and neither is urgent on a dead link. |

**The rule for adding a new kind later:** if a reviewer cannot say what the device would be
asserting that it cannot verify, it is queueable. If they can, it is not.

### B.2 The idempotency key

**Generated on the client at the moment of the action** — the tap — and carried unchanged
through every retry. `K2-Offline-sync-queue.png` says why in the design's own words:
*"Generate it at send time and a retried batch creates a second punch for the same person."*

- **Format:** `crypto.randomUUID()`. Available in every target browser and in Node without a
  dependency (§2: no new dependencies, ever). The server validates the shape and rejects
  anything that is not a UUID, so a malformed client cannot fill the table with junk.
- **Random, not content-derived — deliberately.** A hash of the payload would also collapse
  two *genuinely distinct* identical writes: a supervisor logging 100 sheets at 14:00 and
  another 100 at 14:20 with the same machine, order and quantity must produce two rows. One
  key per *action*, not per *value*. Do not "improve" this into a hash.
- **Double-tap is a different problem** and is solved where it happens: the submit button
  disables while a write is in flight (`isPending`), as the existing screens already do.
- **The key is the primary key** of `MisIdempotencyKey`, so concurrency is settled by the
  database: two replays racing means one insert wins and the other takes a unique-violation,
  re-reads, and returns the winner's result.

### B.3 The five outcomes

Every replay attempt ends in exactly one of these. The queue holds a `status`; the server
records the same outcome durably (§B.7).

| Outcome | Means | Queue does | User sees |
|---|---|---|---|
| **APPLIED** | The write succeeded. | Retire the entry. | Counts toward "all saved". |
| **DUPLICATE** | This key was already applied. | Retire the entry, **return the stored original result** — not an error. | Nothing. It already worked. |
| **RETRY** | Transient: offline, timeout, 5xx, deadlock. | Keep, back off, try again (§B.6). | "waiting to send". |
| **PARKED** | It was legal when queued and is illegal now, because the world moved (clearance expired, phase signed off, order closed, permission withdrawn). | Keep **forever**, stop retrying, surface it. | "failed to send · View", with the reason and a Fix. |
| **REJECTED** | The entry itself is wrong and no passage of time fixes it (missing a required field, malformed, key not a UUID). | Keep, stop retrying, surface it. | Same row, different reason and a different Fix. |

**PARKED and REJECTED look identical to the worker** — one red row, tappable, per
`08-Empty-error-offline.png`. They are distinct in the data because the resolution differs:
a parked write needs the *world* changed or an override recorded; a rejected write needs the
*entry* completed.

**Nine replays of one applied write produce nine DUPLICATEs and one row.** That is the
acceptance check, and it only holds if §B.7's transactional rule is obeyed.

### B.4 Time — what the server stamps and what the device merely claims

Two kinds of write, and conflating them is how payroll breaks.

| Kind | Business time is | Example |
|---|---|---|
| **Server-stamped** | the server's clock at the moment the write **applies** | a sign-off, an audit entry, `createdAt` everywhere |
| **Client-recorded** | the moment the human acted, as the device recorded it | an attendance punch, a production entry's `loggedAt` |

A punch at 06:04 that syncs at 07:41 **is a 06:04 punch** — `K2-Offline-sync-queue.png`
shows exactly that, and a worker who punched at 06:00 was not late because the tablet found
signal at 07:41.

The rules that follow:

1. **`clientRecordedAt` is stored on every queued write, always, in its own column**, raw
   and unmodified — including for server-stamped kinds, where it is evidence rather than
   business data.
2. **A client timestamp never becomes a server-stamped field.** No argument, no field, no
   "just for the offline queue" exception. Appendix A §A.6 point 5 already says this for
   sign-off; it generalises.
3. **For client-recorded kinds the device's time is accepted** — but only inside a
   tolerance. Outside it (a punch in the future, or older than the queue's age limit) the
   write is **PARKED**, not clamped and not discarded: a device whose clock is wrong by six
   hours is a fact somebody needs to know, and silently snapping it to `now()` destroys the
   evidence that would have revealed it.
4. **The tolerance and the age limit are business rules**, not constants — the same
   effective-dated mechanism D7 uses, editable without a deploy
   (`offline.clock_skew_minutes`, `offline.max_queue_age_hours`).
5. The *policy* behind 3 and 4 — which kinds are client-recorded, and that skew parks rather
   than clamps — is **D15**.

### B.5 Surviving the gates from Phases 6–9

This is the section the other phases exist for. In every case below the write was legal when
it was queued.

#### B.5.1 Line clearance expired in the meantime (D7)

The supervisor tapped at 14:05 with the line properly cleared. The tablet syncs at 16:40, by
which time the clearance has expired — the machine changed order (JOB), the shift ended
(SHIFT), or the cap elapsed.

**Outcome: PARKED**, reason `CLEARANCE_EXPIRED`. `assertLineCleared` throws exactly as it
would online; the queue does not pre-empt it, re-clear the line, or reach around it.

*Why not just apply it?* The production genuinely happened at 14:05 under a valid clearance,
so dropping it loses real output. But the server cannot verify from a 16:40 replay that the
14:05 setup was the cleared one. **A human decides, on the record:** a holder of
`clearance.write` sees the parked entry with its `clientRecordedAt`, the clearance that was
in force then, and the one in force now, and either

- **confirms** it — the entry applies, and the override is audited with who confirmed, when,
  and which expired clearance it was measured against; or
- **discards** it with a reason, which is also audited.

The system never picks. This is the same shape as Appendix A's acknowledge-don't-resolve and
D12's reassign-don't-sign: where only a person can take responsibility, make them.

#### B.5.2 The job phase was signed off in the meantime (Appendix A)

The sharpest case. The phase was active at tap time; the in-charge signed it off before the
entry arrived. Applying it now would change totals a signature has already claimed — it
would falsify a signature after the fact.

**Outcome: PARKED**, reason `PHASE_SIGNED_OFF`. Resolution is either:

- the **Owner reopens the phase** (`reopenPhase`, Owner-only, reason required, downstream
  flagged — Appendix A §A.4), after which the entry replays and applies cleanly and the
  in-charge signs again against corrected totals; or
- the entry is discarded with a reason.

**The queue must never reopen a phase itself.** Reopening is an Owner's act with a recorded
reason, by design, and a background sync is not an Owner.

#### B.5.3 The job phase was *reopened* in the meantime (Appendix A §A.2)

**Outcome: APPLIED, normally.** `REOPENED` is an active status at every gate, so the write
is legal again. Stated because it reads as a surprise: reopening a phase un-blocks writes
queued against it. That is correct and intended — the phase is open for work again.

#### B.5.4 The order closed in the meantime

`CANCELLED`, `DELIVERED` or `COMPLETED` (`CLOSED_ORDER_STATUSES` in `orders.ts` already
names these).

**Outcome: PARKED**, reason `ORDER_CLOSED`.

⚠ **`logProduction` does not check this today** — production can currently be logged against
a delivered order, online. The check belongs on the write path so the live and replayed
paths cannot drift, which means adding it changes online behaviour too. That is **D14**, and
**Phase 11 implements it**.

**Refusable, not permanently impossible.** A closed order can be **reopened** —
`reopenOrder(orderId, reason)`, `orders.write`, reason required, audited — after which the
parked entry replays and applies cleanly, exactly as §B.5.2's phase reopen works. Phase 11
builds the refusal and this path together.

That symmetry is the point. There is **one mental model for every park in this contract:
the world must change before the write lands, and a named person changes it on the
record.** A refusal with no route through is not a gate, it is a dead end — and a dead end
in front of a legitimate late correction is what sends somebody to edit the database by
hand, which is the one outcome none of this can survive.

#### B.5.5 The entry has no machine (D8)

An entry queued by an older client build, or one whose machine never got recorded.
`logProduction` requires `machineId` and `assertLineCleared` cannot run without it.

**Outcome: REJECTED**, reason `MACHINE_MISSING` — no passage of time fixes it. Fix is: the
supervisor names the machine now, and the entry replays.

**Never infer the machine** — not from the order, not from the last allocation, not from the
operator's usual press. Guessing attaches output and wastage to the wrong machine, and
MIS-265 already recorded why that class of guess is unacceptable: it is undetectable
afterwards.

#### B.5.6 Permission changed in the meantime

The actor lost the right to make this write between tap and sync.

**Outcome: PARKED**, reason `FORBIDDEN` (`MisForbiddenError`). Never applied under a
different actor's authority, and never re-attributed to whoever happens to be logged in when
the sync runs.

### B.6 Ordering, backoff, and the age limit

- **Per-device FIFO, ordered by `clientRecordedAt`** — the moment the human acted, not the
  moment the row was written to IndexedDB and not the moment it reaches the server. Ties
  break by insertion order. **One request in flight at a time per device.** A clock-out must
  never overtake its clock-in, and a phase's production entries must arrive before anything
  that reads their totals. Parallelism here buys milliseconds and costs correctness.
- Ordering is **per device and only per device.** Two tablets syncing the same morning
  interleave freely; nothing in this contract tries to order events across devices, because
  nothing can — their clocks disagree, which is the whole subject of §B.4.
- **A PARKED or REJECTED entry does not block the entries behind it.** It steps aside and the
  queue continues past it. Otherwise one unrecognised badge stops a whole morning of punches
  — the failure `K2-Offline-sync-queue.png` is explicitly designed against, showing the
  failed row *beside* "11/14 sent" and "2 more waiting".
- The one exception: an entry that **depends** on a parked one (a clock-out whose clock-in
  parked) parks too, with reason `PREDECESSOR_PARKED`, rather than applying against a state
  its predecessor never created. Resolving the predecessor releases both.
- **Backoff** is exponential with jitter, capped at one minute, and applies to RETRY only.
- **An entry older than the age limit is PARKED, never dropped.** There is no expiry that
  deletes factory data. The limit exists so a tablet found in a drawer six months later
  surfaces its contents to a human instead of silently replaying them into a closed month.

### B.7 Where a parked write lives — and the one transactional rule

**The server records every attempt and its outcome, including parks.** A parked write is
durable server-side, carrying its full payload, not only on the device.

The reason is blunt: if parking lived only on the tablet, a lost, wiped or dead tablet would
take real production records with it, silently — precisely the failure this contract exists
to prevent. It also lets the portal answer "is anything stuck anywhere in the factory?" and
lets a park be resolved from the office when the device never comes back.

**The inbox — `queue.review`, built by Phase 23.**

A queue with nowhere to review it is a silent drop with extra steps. Parked and rejected
writes are surfaced on their own screen, which shows for each one: the **payload** as
submitted, the **reason** (code and sentence), and the **evidence** — `clientRecordedAt`,
the device, the actor, the attempt count, and for a clearance park the clearance that was in
force then beside the one in force now (§B.5.1).

- Reading the inbox needs the new **`queue.review`** action (OWNER, ADMIN — plus
  SUPER_ATTENDANCE_OPERATOR for the punch kinds, whose parked-punch card §4.6 already
  designs and Phase 13 already owns on the kiosk side).
- **Resolving** needs whatever the underlying act needs, on top of `queue.review`:
  `clearance.write` to confirm past an expired clearance (§B.5.1), an Owner's
  `phase.reopen` for a signed-off phase (§B.5.2), `orders.write` to reopen a closed order
  (§B.5.4). `queue.review` alone lets you *see and discard with a reason* — never apply
  something you could not have applied yourself.
- **Phase 13** surfaces parked *punches* on the tablet and on the Super Attendance
  Operator's home. **Phase 23** is the portal-side inbox for everything, including
  production entries from a tablet nobody is holding.

This phase did not exist before this appendix: no phase in 0–21 owned this screen, which is
exactly the gap "a queue with no inbox" describes. It was added as Phase 22, then renumbered
to **23** when a second Phase 22 turned up; it is in §4 and §6 as 23.

**The rule that makes idempotency real:**

> The idempotency record and the business row are written **in the same database
> transaction.** Always.

A crash between the two makes the dedupe a lie — the row exists, the key does not, and the
retry duplicates it. `logProduction` today writes its row and then audits outside a
transaction; Phase 11 must bring the business write and the key write inside one.

### B.8 What the worker sees

Both screens are already designed; build these, do not invent.

**The sync indicator** — `08-Empty-error-offline.png`, "always visible, never a surprise".
Three states, one row each: green `All saved` with a relative time; amber
`N entries waiting to send` with `Offline`; red `N entries failed to send` with **View**.
The design note is the requirement: *"A failure the worker cannot see is a failure that
becomes a missing production record three weeks later. Failed is tappable."*

**The offline toast** — same sheet: *"Could not save — you are offline / Saved on this
phone. It will send when signal returns."* Never a bare "failed": an error that does not say
what the system already did makes the worker retype everything.

**The kiosk queue** — `K2-Offline-sync-queue.png`: an amber banner (`No signal · N punches
held on this tablet`) that never blocks the scan target, `11/14 sent` with a progress bar,
sent rows with their *original* punch times, the failed row inline with a **Fix** button, and
`N more waiting`. Offline is a banner, never a block.

Both languages, per §7 of the spec. "Saved on this tablet, sent automatically" — not
"connection error".

### B.9 Module boundaries

- **`src/lib/mis/offline/**` imports nothing from `src/server/**`.** It is client-only code
  and the queue must be testable with no database at all.
- The queue is **transport-agnostic**: it stores `kind` + `payload` + `key`, and a
  **registry** maps a `kind` to a sender the app layer supplies at startup. `queue.ts`
  therefore imports no server action, and a test registers a fake sender.
- The idempotency **key format and the outcome vocabulary** are shared client/server and live
  in `src/lib/mis/offline/idempotency.ts` — pure, no Prisma, importable from both sides, the
  same pattern `po-purpose.ts` and `shift-window.ts` already use.
- Replay calls **the same server action the online path calls.** There is no second write
  path to drift out of step; the only thing the replay layer adds is classifying the thrown
  error into §B.3's five outcomes.

### B.10 Live attempts, actors, and who may replay a park — *added by Phase 11*

> Phase 10 wrote §B.1–B.9 before anything used them. Building the first real consumer found
> four things the contract left implicit. They are recorded here, in the contract, rather than
> left in code where a later phase would have to rediscover them.

**B.10.1 A live attempt never parks.** MIS-86: *offline-capable, not offline-only* — when
there is signal the screen writes straight through, under the same key it would have queued
under. If a gate refuses a **live** attempt, the refusal goes back to the person at the screen
and **nothing is recorded server-side**. Only a write that reaches the server *from the
queue* is parked durably.

*Why.* A parked key is final — §B.3: the server does not retry a park behind a human's back.
If the first live refusal parked, "you forgot to clear the line → clear it → tap Log again"
would return the old park for ever. The live/replay split is what keeps that recovery working.
If a live attempt fails for *network* reasons (throws, or exceeds the client timeout) the
write is queued **with the same key**; if the server had in fact applied it, the replay
returns DUPLICATE with the original result. This is the case the key exists for.

**B.10.2 The actor is fixed at the tap.** Each queued entry carries `queuedBy`, the user id at
the moment of the tap. At replay the signed-in user must equal it; otherwise the write is
**PARKED, `FORBIDDEN`** — never re-attributed to whoever is signed in when the sync runs
(§B.5.6). A **signed-out** device is different: that is not a withdrawn permission, so it
returns **RETRY** and the queue waits for a sign-in.

**B.10.3 Server actions return outcomes; they do not throw them.** In a production build React
replaces any error a server action throws with a generic *"An error occurred in the Server
Components render… omitted in production builds"* string — the specific message never reaches
the browser. Every outcome in §B.3 therefore travels as a **returned value** with `reason` and
`detail`. A screen that decides what to show by reading `error.message` works in development
and silently breaks in production. (Phases 6 and 7 both did this on the production screens;
Phase 11 corrected it there.)

**B.10.4 Who may replay a park — by reason (D17).** A retry never forces anything: it re-runs
**every** gate, exactly as a live write would, and lands only if they now pass. What differs
is whether a *plain retry* is an acceptable way to release the park.

| Park reason | Plain retry may release it? | Because |
|---|---|---|
| `ORDER_CLOSED` | **yes** | An Admin reopened the order on the record (D14, §B.5.4). |
| `PHASE_SIGNED_OFF`, `PHASE_NOT_ACTIVE`, `PHASE_AMBIGUOUS` | **yes** | The Owner reopened, or the in-charge started, the phase on the record (§B.5.2). |
| `FORBIDDEN` | **yes** | The right was granted, or the original user signed back in. |
| `UNKNOWN` | **yes** | Nothing about the world needs certifying — the failure was ours. |
| `CLEARANCE_EXPIRED`, `CLEARANCE_MISSING` | **no** — audited override | A fresh clearance certifies the machine *now*, not the setup at the moment of the tap. Re-clearing and retrying would launder an expired clearance into a valid one (§B.5.1). |
| `CLOCK_SKEW`, `TOO_OLD` | **no** — audited override | Only a person can vouch for a time the device got wrong (D15). |
| `PREDECESSOR_PARKED` | released with its predecessor | §B.6. |
| `REJECTED` (any) | **never** | The entry itself is wrong; the fix is a new entry under a new key. |

A retry that lands records **who released it and when** (`resolvedById`, `resolvedAt`). The
inbox (Phase 23) builds the audited *override* for the
"no" rows and the resolve-from-the-office path for a tablet nobody is holding; both call the
same server function with the payload stored in `MisQueuedWrite`.

**B.10.5 Racing replays are settled inside the transaction.** The dedupe row is **claimed
first, in the same transaction as the business write**: a `create` for a new key, or a
conditional `updateMany` on the row's current status for an existing one. A second racing
attempt blocks on the row, then fails the claim, rolls its business write back with it, and
re-reads the winner's result. (An `upsert` would not do this — it succeeds for both, and both
business rows commit under one key. Phase 10 shipped exactly that; Phase 11 replaced it.)

_End of guide. Ticket verdicts: `TICKET_INVENTORY.md`. Design: `MIS_UI_SPEC.md`. The PO
change and its open risks: `CHANGE_PO_WITHOUT_BOM.md`._


---

### Phase 22 · Unclaimed gaps — things no ticket owns

**Before any work in this phase:** create the three Jira tickets for 22.1, 22.2 and 22.3 in
project MIS, parented to the epic that best fits each (scheduling for 22.1, platform for 22.2
and 22.3), and record the keys here. Phase 0 trued the board up; an untracked phase quietly
undoes that.

Added after Phase 9. These are real gaps found during execution that no MIS ticket and no
other phase claims. Each would otherwise surface at handover as "it was never built", which
is the failure mode this whole guide exists to prevent. Run this phase last, or pull an item
forward if it blocks something.

**Model:** sonnet · **Checkers:** haiku.

**22.1 — Machine booking has no order/phase picker.** `machine-board-screen.tsx` is the only
caller of `allocateMachine()`, and free-text `jobRef` is its only input. MIS-261 wants the
`jobRef` write path retired, but nothing replaces it, so Phase 9 correctly kept it rather than
ship a silent regression. Build the order → job-phase picker (phases must belong to the order
and be open, per Appendix A), wire it through `allocateMachine`, then retire the `jobRef`
write path and close MIS-261. Keep `jobRef` readable for historical rows.

**22.2 — Decide the orphan `mis_po_purpose` migration.** `prisma/migrations-pending/20260915000000_mis_po_purpose`
is unapplied and dated *older* than six applied migrations, so applying it now lands out of
order. `poPurpose` is currently derived from `bomRef` and nothing depends on the enum. Decide
explicitly: re-date and apply, or delete and drop the enum idea. Do not leave it to be found
by accident. See `CHANGE_PO_WITHOUT_BOM.md` §4.

**22.3 — Stale seed scripts.** `prisma/seed-demo.ts` and `prisma/seed-reset.ts` are stale
against the schema and, since the Phase 1 tsconfig fix, unchecked by `tsc`. The live DB already
holds real seeded data. Delete them, or repair them and bring them back under type-checking —
but do not leave dead scripts that look runnable.

**Acceptance.** MIS-261 closed; no unapplied migration left in `migrations-pending/`; no
untyped script left in `prisma/`. Verify: `node_modules/.bin/tsc --noEmit --skipLibCheck`
silent, `pnpm vitest run`, `pnpm build`.

**Prompt.**
```
run phase 22 from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Three unclaimed gaps, described in the phase section. Do 22.1 (order/phase picker for machine
booking, then retire the jobRef write path and close MIS-261) with mis-fe-build → mis-fe-check,
then 22.2 and 22.3, which are decisions plus small cleanups — surface each to me before
deleting anything.
Model: sonnet. Checkers: haiku.

Verify with `node_modules/.bin/tsc --noEmit --skipLibCheck` (no grep filter, must be silent),
then `pnpm vitest run`, then `pnpm build`.

Follow the Phase Contract in §1A, including the rule on recording new policy decisions.
FIRST: read §1A, this phase's section, the tail of Arjun/app/docs/PHASE_LOG.md, and the most
recent phase report. LAST: write Arjun/app/docs/phase-reports/phase-22.md, append exactly one
row to PHASE_LOG.md, and stamp any phase you affect.
Report in 150 words or fewer.
```


---

### Phase 24 · Desktop layer (D1–D14) — the half of the design that was never built

> ⚠ UPDATED BY PHASE 24 — **24.1, 24.2 and 24.3 are BUILT (2026-09-21/22); the schema gate has been run.**
> The desktop shell (D3), the widget library and role-gated catalogue (D2), per-user layout
> persistence on `mis_dashboard_widgets`, the Customise flow, and the Owner dashboard at
> `/mis/dashboard` (D1). A flag-gated "Factory MIS" entry now sits in the workspace sidebar.
> **24.4: D4–D9 and D14 are BUILT (Parts C and D, 2026-09-22).** D4 order detail, D5 machine
> timeline, D6 BOM costing, D7 reports (wastage), D8 attendance month, D9 QC hourly grid, D14
> defects & rework. **Four remain:** D10 master data, D11 traceability, D12 business rules, D13
> documents. The three dashboard widgets that waited on D9/D14 (`wastage.byPhase`,
> `qc.aqlThisMonth`, `qc.defectsOpen`) can now be wired to `getWastageReport`,
> `getQcHourlyGrid` and `getDefectReport`. **Two conventions the checkers enforced:** (1) any
> explicit `?view` on a page returns the phone screen at every width, so a phone screen's own
> tab links never bounce a desktop user back to the desktop view; (2) a desktop screen's
> second query is wrapped in try/catch — a refusal is "no access", any other failure is
> logged and the desktop half says so, so the phone half still renders. Pattern to follow: a `lib/mis/*` pure module, a `server/mis/*-desktop.ts` view composed
> from the phone layer's functions, a `components/mis/desktop/*` tree, and the page wrapping
> the phone screen in `lg:hidden` and the desktop in `hidden lg:block`; `?view=classic|edit`
> keeps the full phone screen reachable on a desktop. Anything carrying a rupee is a
> separate `wages.read` function that is never called for other roles (D6 shows how). Build each on `DesktopShell` + `DesktopPageHeader` (one filled button per page) and the
> chart primitives in `lib/mis/chart.ts`; D9 and D14 also owe three dashboard widgets the
> queries they are currently showing empty states for.
> **Read before continuing:** D3's own breakpoint line says **three widths, two layouts**. The
> 1280px sidebar collapse is a chrome state, NOT a third layout; 1024px is the only layout
> boundary, and below it the phone layout takes over (it used to hand over at 768px, which
> showed a rail belonging to neither layout). **Do not add a JS media query** — CSS alone
> decides, or the two chromes can disagree about which is showing.
> **The dashboard is a second VIEW, never a second data path:** every widget figure comes from
> a server function the phone layer already uses, and the browser sends an ORDER of widget
> keys, never geometry.

> ⚠ UPDATED BY PHASE 14 — the phone tab set is pinned to MIS_UI_SPEC §4.5 (`components/mis/home/bottom-nav.test.tsx`)
> and the permission-derived menu per role (`server/mis/navigation.test.ts`); desktop must not widen either. Any
> role-assignment screen must enforce **D25** on the SERVER — the picker's `assignableRoles` is not a control (F-10).


Added after Phase 11, when a complete screenshot set surfaced a **D-series** the earlier
folder did not contain. Everything built so far (Phases 1–11) is the **phone** layer, R1–R5.
The desktop layer is designed, approved and unbuilt. This is not new scope invented late — it
is approved design that was invisible because the reference folder was incomplete.

**Read `app/design/screens/D1-Owner-dashboard.png` and `D2-Widget-library.png` before
planning.** Model: opus for 24.1–24.2 (architecture), sonnet after. Checkers: haiku.

**What D1 establishes, in its own words:**
- Desktop is a **widget canvas**, not the phone home stretched wide. Left icon rail, top bar
  with search, a **Customise** button, A/अ toggle, avatar.
- "Every block here is a widget from the library. The Owner places them; **the layout is
  stored per user, not hardcoded**."
- "The money widget is the one no other role can add — **the API never sends it to them**."
  Role-gating is server-side, not a hidden client card.
- **Exactly two layouts.** Below 1024px it becomes the phone home R1 — same widgets, one
  column, charts degrade to sparklines. "There is no third layout."
- Charts: one scale, one axis, never dual. Series hues are computed and colour-blind checked;
  green/amber/red stay reserved for state, so a series is never coloured green.

**Order.** 24.1 desktop shell (D3) · 24.2 widget library, per-user layout persistence and the
role-gated catalogue (D2) · 24.3 owner dashboard (D1) · 24.4 the remaining eleven D screens,
each against its artboard: D4 order detail, D5 machine timeline, D6 BOM costing, D7 reports,
D8 attendance month, D9 QC hourly grid, D10 master data, D11 traceability, D12 business
rules, D13 documents, D14 defects/rework.

**Non-negotiable.** Wages stay OWNER-only end to end (D6 in DECISIONS.md): the widget
catalogue endpoint must not return the money widget to a non-owner, and no layout row may
reference it for them. Reuse the phone layer's server functions — this is a second view of
the same data, never a second data path.

**Acceptance.** Every D artboard has a route; the Customise flow adds, removes and reorders
widgets and survives reload; a non-owner's catalogue response provably excludes the money
widget; resizing below 1024px yields the phone layout with no third breakpoint.
Verify: `node_modules/.bin/tsc --noEmit --skipLibCheck` silent, `pnpm vitest run`, `pnpm build`.

**Prompt:** ask for it when you reach this phase — it is not needed before then.

### Checker model — raised to sonnet after Phase 13

Phases 12 and 13 both reported checkers returning PASS with wrong line references and an
empty NOT VERIFIED section, after the evidence rules were already tightened. Instructions
were not the constraint; the model was. **Checkers now run on sonnet, not haiku.**

A false PASS is worse than no checker: it manufactures confidence that stops anyone looking
again. Where a builder's own mutation testing (break the code, name the test that goes red)
has caught more than the checker did, trust the mutation test and say so in the report.
Builders still must not accept a bare PASS — no file:line, no counts, no NOT VERIFIED list
means the verdict is INCONCLUSIVE.


---

### Phase 14F · Fix the five — **RUN THIS BEFORE PHASE 15**

> ⚠ UPDATED BY PHASE 14F — **DONE (2026-09-21); do not re-run.** F-10, F-01, F-02, F-03 and F-08 are fixed, plus
> F-04 (same function as F-03); the `it.fails` groups became ordinary tests, and each non-Owner role is refused at
> the server function (`phase-reports/phase-14F.md`). **Two things the table below got wrong:** F-02 is the settings
> LIST leaking wage rules and F-03 is the settings EDITOR accepting any key, wage and AQL alike (the table has them
> as "read and edit wage rules" / "AQL thresholds" — `qa/FINDINGS.md` is authoritative). **One half is NOT done:**
> "a computed period should be immutable once closed" needs a stored payroll snapshot (schema); it is recorded in
> **D27** and left for Phase 25. Remaining open findings: F-05, F-06, F-09, F-11, F-13.

Phase 14 wrote tests that pass today and turn red when the bug is fixed. That means these
are live defects in shipped code, not hypotheticals. Two of them are the exact guarantees
this project has been telling the client are enforced. Nothing else proceeds until they are
closed.

**Model: sonnet. Checkers: sonnet.** One finding at a time, checker after each.

| Finding | What is actually wrong | Why it is severe |
|---|---|---|
| **F-10** | An Admin can grant the Owner role — to anyone, including themselves | Privilege escalation. Any Admin can become Owner and then read wages. Fix this one first. |
| **F-01** | Payroll figures gate on `attendance.read`, not a wage permission | Admin, Supervisor and both attendance roles can open the payroll screen and the payslip. The OWNER-only wage rule is not in force. |
| **F-02** | Admin can read and edit wage rules via the settings screen | Same leak by another door. |
| **F-03** | Admin can read and edit AQL thresholds via the settings screen | Contradicts D6, which put AQL behind an Owner-only permission. |
| **F-08** | Changing a rate changes last month's payroll | A closed month must not move. Rates are effective-dated; payroll must resolve the rate as of the period, and a computed period should be immutable once closed (MIS-272). |

**How to fix.** For each: make the failing test pass by changing application code, not the
test. Do not weaken a test to make it green. After each fix the `it.fails` marker comes off
and the test becomes an ordinary passing test. Re-run the whole suite after every finding —
these touch shared permission code and can break each other.

**Root-cause it, don't patch it.** F-01/F-02/F-03 are one bug wearing three hats: money and
quality thresholds were gated on whatever permission the surrounding screen already had.
Audit every `requirePermission` call in payroll, wage and AQL paths and give each the right
action. F-10 belongs in the role-granting function, not the UI.

**Acceptance.** All five `it.fails` tests are ordinary passing tests; the full suite is green;
`pnpm build` passes; and a test proves each of the seven non-owner roles is refused at the
server function, not merely hidden in the UI.

**Prompt.**
```
run phase 14F from Arjun/app/docs/DEVELOPMENT_GUIDE.md

Phase 14 proved five live defects. Fix them in application code — never by weakening a test.
Order: F-10 (privilege escalation) first, then F-01, F-02, F-03 as one root cause, then F-08.
Read Arjun/app/docs/qa/FINDINGS.md and Arjun/app/docs/DECISIONS.md D6, D24, D25 first.
One finding at a time: mis-be-build then mis-be-check, and do not start the next until the
checker returns PASS. Re-run the FULL suite after each — these share permission code.
Model: sonnet. Checkers: sonnet.

Each fix removes its it.fails marker and leaves an ordinary passing test. Add, for each of
the seven non-owner roles, a test that the SERVER FUNCTION refuses — UI hiding is not a fix.

Verify with `node_modules/.bin/tsc --noEmit --skipLibCheck` (silent), `pnpm vitest run`,
`pnpm build`.

Follow the Phase Contract in §1A. FIRST read §1A, this section, the tail of PHASE_LOG.md and
phase-reports/phase-14.md. LAST write phase-reports/phase-14F.md, append one PHASE_LOG row,
and stamp any phase you affect. Cite D1-D25.
Report in 150 words or fewer.
```

---

### Phase 24F · Browser walkthrough & fix — **RUN BEFORE PHASE 25**

> ✔ DONE (2026-09-22) — see `phase-reports/phase-24F.md` and `qa/WALKTHROUGH-24F.md`. F-24 – F-28 filed. Every route opens for every role at 390 and 1440 px.
Nothing in 24A–E was seen in a browser. Store, Inventory and GRN screens do not open for the user.
1. Run `pnpm dev`, then sign in as each role (Owner, Admin, Supervisor, QC, Attendance, Store Manager, …) at phone width (390px) and desktop width (1440px).
2. Open every nav item and every route under `/mis`. For each one, record the result (opens / blank / error / wrong layout / wrong role) in `docs/qa/WALKTHROUGH-24F.md`, with the console and server errors.
3. Fix in this order: pages that do not open (store, inventory, GRN first), then crashes, then layout mismatches against `design/screens/`.
4. Every fix gets a test that fails without it. Use the standard verify commands. File findings from F-24.

### Phase 24G · UI polish — **RUN BEFORE PHASE 25**

> ✔ DONE (2026-09-22) — see `phase-reports/phase-24G.md` and `qa/UI-GAPS-24G.md`. F-25 and F-27 closed (D32); F-29–F-33 filed as structural design mismatches needing a product call. tsc silent; vitest 184 files / 3984 passed + 10 expected-fail; build passes.

> 24F made every screen open. 24G makes every screen match `design/screens/` (map: `design/_MAPPING.md`). **Model: sonnet. No schema change.**
1. Walk every `/mis` screen as every role at **390 and 768 px (phone layout) and 1024 and 1440 px (desktop layout)** — 1024 is the only layout boundary (D1/D3). Compare each with its PNG and log every gap in `docs/qa/UI-GAPS-24G.md` (screen · role · width · what differs · severity · fixed / left).
2. Fix the gaps: layout, spacing, typography, colour (tokens only — no new hex), empty / loading / error states, tap targets of at least 44 px, no horizontal page scroll. A fix that can be tested gets a test that fails without it.
3. **F-27 → D32:** a "More" tab on the phone bottom navigation for Owner, Admin and Supervisor that lists every screen their role may open (Store, GRN, PO, Inventory, Suppliers, ...). The list is derived from the same permission table as the desktop sidebar, so the two cannot disagree.
4. **F-25:** guard `/mis/print/payslip/[employeeId]` with `isUuid` and give `wage-screens.test.tsx` a UUID fixture (`dynamic-route-guards.test.ts` then loses its exception).
5. Use the build/check agents, the standard verify commands and the Phase Contract (§1A). New F-numbers continue from F-29, new D-numbers from D32. File anything you do not fix.

### Phase 25 · Payroll rules from Arjun's review — **SCHEMA GATE**

> ⚠ UPDATED BY PHASE 24F — (1) **The runtime database pool is ONE connection wide** (`server/db/connection.ts`, `max: 1`) — on purpose. A whole-list
> page that runs a query per row (payroll for 60 people, a per-employee wage lookup) queues on it and dies with `timeout exceeded when
> trying to connect`: fetch once for the whole set (`getStockBalances` in `server/mis/store.ts` is the pattern; §2A.13). (2) A Prisma `Decimal` must
> not reach a client component (§2A.5): wrap a row in `toPlain` (`lib/mis/plain.ts`) on the page, AFTER `withoutMoneyFields` / `forRole`.
> (3) A new `[id]` page guards its id with `isUuid` (`lib/mis/ids.ts`) before any query — `dynamic-route-guards.test.ts` fails otherwise. **Phase 24G
> closed the payslip exception** — every dynamic page including it is now guarded; `wage-screens.test.tsx`'s fixture id is a UUID (F-25). (4) Format a date in a client component with
> `formatFactoryDate` / `formatFactoryDateTime`, never `toLocaleDateString()` (F-26). (5) A search or filter box is `min-h-12 text-base text-slate-900 bg-white`;
> `search-inputs.test.ts` reads every screen.

> ⚠ UPDATED BY PHASE 24E — (1) **Rule changes now have a write path with a start day and a reason:** `scheduleBusinessRule`
> (Owner, `wages.read`) and `createRuleRevision(..., { effectiveFrom, reason, action })` write a NEW row and a `SCHEDULE_RULE`
> audit row; the audit "before" is the row the new one replaces. If D26/D28 add a wage rule, a schedule for it audits the KEY
> only (F-04). `lib/mis/rules-ledger.ts` `validateRuleValue` holds per-key formats — add any new rule key that has a special
> format there, or a bad value will be shown as "in force" and ignored by its reader. (2) **F-22:** most rule readers still use
> the value in force NOW (`getRuleValue` takes no date). Payroll already prices per day (F-08, D27); the AQL, line-clearance,
> offline, timezone and correction-window readers do not — give any reader that judges PAST records a date argument before
> relying on D12's history. `getRuleValue` also compares in UTC while D12 says "from the factory's midnight" (5½ h lag).
> (3) `/mis/settings/rules` is Owner-only and absent for other roles; a new Owner-only screen follows the same page test
> (404 for seven roles). (4) **F-23/D31:** documents are a name + link; the phone screen and `addDocument` still accept any
> pasted string as an `href` — route them through `lib/mis/document-library.ts` `safeHref` if you touch either. (5) A `<select>`
> handed a `defaultValue` after a failed server action reverts on the form reset: key it on the value (D10 and D13 do).
> (6) `audit-payloads.test.ts`'s registry lists `createRuleRevision` as `opts.action ?? 'UPDATE_RULE'`.

> ⚠ UPDATED BY PHASE 24D — **F-06 is CLOSED** (24C: BOM; 24D: `getStoreReport`, PO reads, GRN reads, item reads, every
> write function's return value, and the audit payload — one helper, `lib/mis/money-fields.ts`). Any NEW server function
> that returns a BOM, PO, GRN or item row must pass it through `withoutMoneyFields` / `forRole` unless the caller holds
> `wages.read`. **Still open, and a policy question:** F-15 — writing a price is not gated (D24 governs what is SENT).
> `computePoTotal` is now `wages.read`; a PO screen for any other role must not ask for it.

> ⚠ UPDATED BY PHASE 24 — this phase is now in §2.3's schema-gate list too. Its Half A is the
> payroll-period snapshot D27 leaves undone, plus D28's extra-pay-day model; write the SQL into
> `prisma/migrations-pending/` and stop, exactly as Phase 24 did for the dashboard layout.

> ⚠ UPDATED BY PHASE 14F — **build on these, do not rebuild them.** (1) Every payroll function is `wages.read`
> (Owner only); a component/breakdown function gated on anything weaker reopens F-01. (2) Rates are priced per
> attendance day at the rate in force that day (**D27**) via `getWageRateHistory`, `getWageRuleHistory` and
> `resolveAsOf`; give every new effective-dated component the same reader. (3) **D26 makes overtime a per-hour rate on
> the wage code**, replacing the `OT_MULTIPLIER` rule payroll reads today — when it goes, remove it from
> `lib/mis/rule-keys.ts` (`WAGE_RULE_KEYS`) deliberately, and classify any NEW wage rule there or the settings list
> will show it to an Admin; `wage-rule-keys.test.ts` fails until you do. (4) A computed month is still NOT final
> and a back-dated rate re-prices its days: closing a month needs a stored snapshot table — this phase has a schema
> gate, so build it here (D27 "To change"). (5) New exported functions must appear in `permission-matrix.test.ts`'s
> TABLE and satisfy `server-gates.test.ts`.

New scope from the client demo, clarified by Yash 2026-09-20. **Model: sonnet.**

**25.1 — Payslip is a breakdown.** Rows: Basic Wage, HRA, Allowance, Salary, OT, Bonus. Each
component toggles **per employee** from Settings, so two people on one template show
different rows. A toggled-off component contributes nothing and does not print. Extend the
existing `MisWageType` model; components stay effective-dated so a rate change never moves a
closed month (the F-08 lesson).

**25.2 — OT is a per-hour RATE on the wage code, not a multiplier.** This corrects the
meeting's "multiplier" wording. The owner creates a wage code (e.g. a daily hire at ₹500/day)
and that code carries its own **OT rate per hour**. OT pay = OT hours clocked × that rate.
Different people get different OT rates by being on different wage codes — no multiplier
arithmetic, no ambiguity about whether it applies to basic or gross. Daily and monthly
employees use the **same wage-code fields**; only the base differs.

**25.3 — Pay type and Sunday.** Each employee is MONTHLY or DAILY with a `sundayPaid` flag.
Monthly staff are paid Sundays. Daily hires are paid days-present × rate plus OT, and Sundays
only when actually present, at the ordinary rate (ASSUMED — no premium; confirm with Arjun).
Test both shapes across a month containing five Sundays.

**An employee with no wage code, or a wage code with no OT rate, is a data-health finding** —
surfaced on the Admin home like the missing-Hindi-name card. Never silently defaulted.


**25.4 — Extra-pay days (D28).** A date can be marked extra-pay: defaults to everyone present,
narrowable to chosen employees or departments, and carrying either a multiplier or a flat
amount, picked per day. Admin and Super Attendance Operator **propose**; it counts only once
the **Owner approves**, through the existing approval queue. Test a day where an extra-pay
day and OT both apply — that overlap is where payroll goes wrong.

**25.5 — Multiplier basis (D28).** Monthly/fixed employees carry a monthly multiplier. Daily
employees take theirs from the wage code, and the wage code states whether its figure applies
**per month or per hour**. The calculation reads that flag; it never infers the basis.

**Wages stay OWNER-only throughout (D24).** Every new server function needs the wage
permission and a per-role refusal test. Phase 14F closed exactly this leak; do not reopen it.

**Prompt:** ask for it when you reach this phase.
