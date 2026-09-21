---
name: mis-schema-gate
description: Run a Prisma schema change for the Bhaskar MIS in this environment's two halves. Use whenever a phase adds or alters a Prisma model, adds a column, or adds a foreign key — because prisma generate and prisma migrate cannot run in the agent shell, only on the human's Mac.
---

# mis-schema-gate

`prisma generate` and `prisma migrate` **cannot run in the agent shell** — the engine
download returns 403. So any TypeScript referencing a new model will not typecheck until
the human regenerates the client. Split the work; do not fight it.

## Half A — agent, this session

1. Edit `prisma/schema.prisma`. Add the model/column/FK. Map it `@@map("mis_<snake>")`.
2. Hand-write the SQL at
   `prisma/migrations-pending/<YYYYMMDDHHMMSS>_<snake_name>/migration.sql`.
   Copy the shape of `prisma/migrations-pending/20260915000000_mis_po_purpose/` — it is
   the convention, including its **rollback section** at the bottom as a comment block.
3. New foreign keys against tables with live rows go in **nullable**, get backfilled, and
   are tightened later. Never `NOT NULL` against existing rows.
4. **Write no TypeScript that references the new model.** Not a type, not an import, not
   a test. That is Half B.
5. Verify — must print nothing:
   ```bash
   cd Arjun/app && node_modules/.bin/tsc --noEmit --skipLibCheck
   ```
6. **Stop.** Report to the human with exactly: the migration folder path, the model name,
   the one command they must run (below), and "Half B needs a fresh session".

## The gate — human, VS Code terminal on the Mac

```bash
cd Arjun/app
mv prisma/migrations-pending/<folder> prisma/migrations/<folder>
pnpm db:migrate && pnpm db:generate
```

If `db:migrate` fails, the migration SQL is wrong — fix it in Half A, do not patch the
database by hand.

## Half B — agent, a NEW session

1. Confirm the model exists before anything else:
   ```bash
   grep -n "model Mis<Name>" Arjun/app/prisma/schema.prisma
   ```
   Not there, or `tsc` still cannot see it? The gate has not run. **Stop and say so** —
   do not work around it with `any`, a raw query, or a hand-written type.
2. Write the server module, then the screen, one ticket at a time (build agent → check
   agent), against the regenerated client.
3. Same verify command. Must print nothing.

## Rules

- One row in `prisma/migrations/` per gate. Never edit an applied migration.
- Half A and Half B are **two sessions**, and both belong to the same phase — one
  `docs/phase-reports/phase-NN.md`, created by Half A, completed by Half B.
- `mis_employees.updated_at` is NOT NULL with no default — pass it on every raw SQL insert.
- Enums live in `@/generated/prisma/enums`; a client component imports the enum, never the
  Prisma client.

## The migrate command

Half A ends by telling the human to apply the migration. The command is:

```
pnpm db:deploy && pnpm db:generate
```

**Never `pnpm db:migrate`.** That is `prisma migrate dev`, which replays history into a shadow
database with no Supabase `auth` schema and always fails at the `mis_documents → auth.users`
foreign key (`P3006` / `P3018` / `3F000`). `db:deploy` is `prisma migrate deploy` — no shadow
database, applies only pending migrations. See MIS_UI_SPEC.md §7.
