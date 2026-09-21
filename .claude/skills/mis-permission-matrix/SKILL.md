---
name: mis-permission-matrix
description: Verify a Bhaskar MIS role's permissions end to end — screen, server function, query scope and audit payload — and generate the table-driven Vitest suite that proves it. Use for any QA phase, any new server module, and any time wages or salary could reach a non-OWNER surface.
---

# mis-permission-matrix

The eight roles, in this exact order, every time:

```
OWNER ADMIN SUPERVISOR QC ATTENDANCE_OPERATOR SUPER_ATTENDANCE_OPERATOR WORKER STORE_GUY
```

`WORKER` is intentionally permission-less. The matrix itself is
`src/lib/mis/permissions.ts` (`MIS_ACTIONS` + `MATRIX`). **Read it and follow it. Never
extend it silently** — a new action is a decision, not a fix.

## The wage rule — the reason this skill exists

**Wages and salary are OWNER-only, everywhere, always** (`wages.read`). They must not
reach another role's **screen**, its **query result**, its **export or print route**, or —
the one people forget — a **`before`/`after` audit payload**. A wage figure in an audit row
is a wage figure a non-OWNER audit screen will render. Reference a wage by its **code**
(`WG-DAILY-01`), never by its amount.

## Verifying one role, end to end — four checks, in order

1. **Screen.** The role's tabs come from `MIS_UI_SPEC.md` §4.5. A forbidden surface is
   **absent from navigation**, not greyed out and not a disabled button.
2. **Server function.** Every export opens with `await requirePermission(action)`
   (`@/server/mis/auth`). Missing guard = fail, even if the screen hides the button.
   `checkPermission` is for rendering only; it is **not** a security boundary.
3. **Query scope.** *May you* (the matrix) and *which rows* (the visibility resolver,
   D4 in `docs/DECISIONS.md`) are different questions. Scope goes in the Prisma `where`,
   never in a client-side `.filter()`.
4. **Audit payload.** `logAuditEvent({ before, after })` — grep the diff for `amount`,
   `wage`, `salary`, `rate`, `₹` inside those objects. Must be zero hits.

## The generated test — one file per server module

`src/server/mis/<module>.test.ts`, following `src/server/mis/guard.test.ts`:

- `describe.each` over all eight roles × every export of the module.
- Assert **allow** or `MisForbiddenError` (thrown message: `Not permitted: <action>`),
  per `permissions.ts`. Never per what the code happens to do today.
- One extra `it` per module: serialise every return value reachable by each of the seven
  non-OWNER roles and assert the strings `wage`, `salary`, `amount`, `rate` and `₹` do not
  appear. Deliberately blunt; that bluntness is the point.
- Add a completeness assertion: the role list under test equals `MIS_ROLES`, so a
  ninth role added later fails this test instead of slipping through.

## Rules

- Agents **write** these tests; the human **runs** them (`pnpm vitest run <path>` on the
  Mac). Vitest cannot run in the agent shell.
- A QA phase never modifies application code. A failing assertion becomes a row in
  `docs/qa/FINDINGS.md`, not a fix.
- Never write a real salary figure into committed test output or a fixture name.
