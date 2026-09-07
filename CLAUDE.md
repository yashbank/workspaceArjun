# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

**Arjun** — a secure, single-workspace internal business dashboard: file management with folders, versioning, trash, storage tracking, role-based access, and an audit log. Future phase: CRM.

## Main app location

The repo root is a **planning workspace** (`docs/`, `brd/`, `PROJECT_STATUS.md`, `cursor/`). All application code lives in **[app/](app/)**, which is its own git repo. **Run every `pnpm` command from `app/`.**

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 · Supabase Postgres + Auth · Tailwind v4 · local/S3 storage.

## Architecture rules

Requests flow **route handler → server-domain module → data layer**. Keep this strict:

- **API routes are thin.** Parse input, call a server function, map errors to HTTP status. Convention: error message `"Unauthorized"`→401, `"Forbidden"`→403, else 400/500.
- **All business logic lives in `src/server/<domain>/`.** Every exported function starts with a `requirePermission(...)` / `requireRole(...)` gate, then logs mutations via `logAuditEvent(...)`.
- Never put logic or auth checks in route handlers or React components.
- Canonical example: [api/folders/route.ts](app/src/app/api/folders/route.ts) + [server/folders/index.ts](app/src/server/folders/index.ts).

Auth/RBAC: [proxy.ts](app/src/proxy.ts) refreshes the session and guards routes; [server/auth/](app/src/server/auth/) handles `getCurrentUser`/`requireUser` (first user ever → `owner`); [server/rbac/permissions.ts](app/src/server/rbac/permissions.ts) holds the `role → permissions` matrix (`owner`/`admin`/`member`/`viewer`).

## Where things live

| Concern | Location |
|---|---|
| Backend logic (gated + audited) | `app/src/server/<domain>/` |
| API routes (thin handlers) | `app/src/app/api/.../route.ts` |
| UI components | `app/src/components/` (file UI in `components/files/`) |
| Pages | `app/src/app/(auth)/`, `app/src/app/(dashboard)/` |
| Client/shared helpers | `app/src/lib/` |

## Commands (from `app/`)

```bash
pnpm dev            # dev server (Turbopack) → localhost:3000
pnpm build          # production build
pnpm lint           # ESLint — must pass
pnpm typecheck      # tsc --noEmit — must pass
pnpm test           # all Vitest tests
pnpm vitest run src/server/rbac/rbac.test.ts   # single file
pnpm vitest run -t "denies viewer write"       # single test by name
pnpm db:migrate --name x   # create + apply migration (needs Postgres)
pnpm db:generate           # regenerate Prisma client
pnpm db:seed               # seed workspace settings (only prod-safe seed)
```

Tests are colocated as `*.test.ts` next to the module.

## Prisma / schema rules

- Single schema: [app/prisma/schema.prisma](app/prisma/schema.prisma). After any change, run `pnpm db:migrate` then `pnpm db:generate`.
- `app/src/generated/prisma/` is **generated — never edit by hand.**
- **Soft deletes** use `deletedAt`; list queries must filter `deletedAt: null`.

## Coding rules

- **Authorize on the server, always** — never trust client-side checks.
- Files: kebab-case (non-components), PascalCase (components). camelCase functions/vars, UPPER_SNAKE_CASE constants, PascalCase types.
- Throw typed errors; never swallow exceptions. Never log secrets, tokens, or full request bodies.
- A bug fix lands with a test that reproduces the bug. Prettier is the only formatter.
- One topic per branch (`feat/…`/`fix/…`/`chore/…`); no direct commits to `main`.

## Important warnings

- **DB connection:** use the Supabase **session pooler (port 5432)**, never the transaction pooler (6543) — 6543 breaks prepared statements. Runtime reads `RUNTIME_DATABASE_URL`; Prisma CLI reads `DIRECT_URL`.
- **Storage** defaults to local filesystem (`.local-storage/`); set `STORAGE_DRIVER=s3` for MinIO/IDrive e2. Downloads use signed, expiring URLs.
- Never run `pnpm demo:seed` / `demo:reset` against production.
- First admin: set `ALLOW_BOOTSTRAP=true`, create account at `/login`, then disable it. Users are invite-only (max 15 seats).
- Treat `docs/` as the source of truth; log meaningful changes in `CHANGELOG.md`.

---

# MIS module — standing rules

Applies to every MIS ticket. Read `MIS_CODE_STRUCTURE.md` once per session.

## Where code goes
`src/app/(mis)/` pages · `src/components/mis/` React · `src/lib/mis/` pure (no Prisma/React) · `src/server/mis/` DB, permissions, money · `prisma/schema.prisma` `Mis*` models.
A path without a `mis` segment is wrong — ask.

## Reuse, never fork
`src/components/ui/` (toast, confirm-dialog, fixed-menu) and `src/server/rbac/` already exist. Extend them. Do not build a second Toast or a parallel RBAC.

## Invariants
- Tests live beside code (`x.ts` + `x.test.ts`). Filenames kebab-case.
- Money computed in `server/mis/`, sent down as a formatted string. Never derived client-side.
- Colour/spacing/type only from the `01-Foundations` tokens. No new hex.
- 44px tap targets, 48px inputs, 16px input text.
- Existing test suite stays green. Never "fix" a failing existing test by editing it.
- One ticket = one branch = one PR. Editing any file outside a `mis` folder needs a PR line saying why.

## Per-ticket loop
1. `git checkout Development && git pull` → `git checkout -b mis/MIS-<n>-<slug>`
2. Read the ticket **and its comments** (screens + file paths are in comments). State files to create. **Stop for approval.**
3. Build.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` — all pass.
5. Commit `MIS-<n>: <one line>`.
6. `git fetch && git rebase origin/Development` → resolve in-branch → **re-run step 4**.
7. Push, PR into `Development`, return the link.
8. Stop. Next ticket only on my word.

## Order
Yash: 26 → 29 → 30 → 31 → 32 → 35 → 38 → 39 → 53 → 55
Sanket: 80 → 77 → 33 → 36 → 54
