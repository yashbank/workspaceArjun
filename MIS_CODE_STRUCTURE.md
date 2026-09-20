# MIS — where code goes

Read this before creating any file. The MIS is a module **inside** an existing, live, 271-test app. It follows that app's conventions; it does not invent its own.

**The one rule:** every MIS file lives under a `mis` segment. If you are creating a file whose path has no `mis` in it, stop and ask.

---

## The tree

```
app/
├─ prisma/
│  ├─ schema.prisma                  MIS models appended here, all prefixed Mis*
│  └─ migrations/                    one migration per BE ticket, never edited after merge
│
└─ src/
   ├─ app/
   │  ├─ (dashboard)/ (auth)/        ← EXISTING. Do not touch.
   │  ├─ (mis)/                      ← every MIS page
   │  │  ├─ layout.tsx                       MIS-30
   │  │  ├─ page.tsx                         role → home router
   │  │  ├─ masters/<name>/page.tsx          departments, machines, processes…
   │  │  ├─ employees/ orders/ production/
   │  │  ├─ qc/ attendance/ reports/
   │  │  ├─ documents/ settings/
   │  │  └─ print/                   A4 routes — own layout, no app chrome
   │  │     ├─ job-card/[id]/page.tsx
   │  │     └─ coa/[id]/page.tsx
   │  └─ api/mis/                    only when a route handler is genuinely needed
   │
   ├─ components/
   │  ├─ ui/                         ← EXISTING shared kit. Extend, never fork.
   │  └─ mis/
   │     ├─ kit/                     MIS-80  button, input, select, card, slide-over, table
   │     ├─ shell/                   MIS-39  mis-shell, bottom-nav, lang-toggle
   │     ├─ masters/                 MIS-54  master-table.tsx
   │     ├─ employees/ orders/ production/ qc/ attendance/ print/
   │
   ├─ lib/mis/                       pure functions — no Prisma, no React
   │  ├─ i18n/                       MIS-77
   │  ├─ roles.ts                    MIS-33
   │  ├─ format.ts
   │  └─ *.test.ts                   co-located, same folder
   │
   └─ server/
      ├─ rbac/                       ← EXISTING. Extend, do not replace.
      └─ mis/
         ├─ flags.ts                 MIS-29
         ├─ roles/                   MIS-32
         ├─ permissions/             MIS-35
         ├─ nav/                     MIS-38
         ├─ masters/                 MIS-53
         └─ employees/ orders/ production/ qc/ attendance/
```

---

## Which layer

| Folder | Holds | Never holds |
|---|---|---|
| `lib/mis/` | Pure functions. Date maths, formatting, validation, i18n strings. | Prisma, React, `process.env`, network calls |
| `server/mis/` | DB access, permission checks, money, audit writes. | JSX |
| `components/mis/` | React. Presentation and local state. | Prisma, raw money, permission logic |
| `app/(mis)/` | Routing, layouts, page composition. | Business logic — pages call `server/mis/` |

A page that queries Prisma directly, or a component that computes a rupee value, is in the wrong layer.

---

## Two collisions already in the repo

Checked before writing this — both would have caused rework:

1. **`src/components/ui/` already contains `toast.tsx`, `confirm-dialog.tsx`, `fixed-menu.tsx`.** MIS-80 lists Toast among its seven components. **Do not create a second Toast.** Reuse the existing one; build only Button, Input, Select, Card, SlideOver and Table in `components/mis/kit/`. If the existing Toast needs a change, change it in place and say so in the PR.

2. **`src/server/rbac/` already exists** with `permissions.ts` and a test file. MIS-35's `requirePermission()` **extends** this — it does not create a parallel RBAC system. Same for `src/components/shell/dashboard-shell.tsx`: MIS-39 builds a *new* shell in `components/mis/shell/`, it does not modify that one.

---

## Conventions (from the existing codebase, not invented)

- **File names kebab-case** — `master-table.tsx`. Component names PascalCase inside.
- **Tests sit next to the code** — `roles.ts` and `roles.test.ts` in the same folder. This is how the whole repo already works.
- **One ticket = one folder = one PR.** If your diff touches four unrelated folders, it is four PRs.
- **Editing an existing file is an event.** Only `schema.prisma`, `next.config.ts` and nav registration are expected. Any other edit outside a `mis` folder needs a line in the PR saying why.
- **The 271 existing tests stay green.** They are the contract with the live app. A red suite is never "fixed" by changing the test.
- **Money never leaves the server.** Computed in `server/mis/`, sent down as a formatted string. No rupee value is ever derived in a component.
- **No new colour, spacing or type values.** Everything comes from the tokens on `01-Foundations`.

---

## Branching

Current: `main → development → yash → sanket`.

That chain means Sanket's work sits on top of Yash's unmerged commits, and a rebase on `yash` breaks `sanket`. Going forward:

- **Branch per ticket, off `Development`:** `mis/MIS-80-ui-kit`, `mis/MIS-54-master-table`.
- **PR into `Development`,** not through a person's branch.
- Long-lived personal branches (`yash`, `sanket`) are for scratch work only — nothing merges from them.

Sanket's current `sanket` branch: finish MIS-80 on it, PR it straight into `Development`, then start MIS-77 on a fresh `mis/MIS-77-i18n` cut from `Development`.
