-- NOT APPLIED. Deliberately parked outside prisma/migrations/ so `prisma migrate`
-- never picks it up. See app/docs/DEVELOPMENT_GUIDE.md Phase 4 for when to
-- promote it (after the human runs `pnpm db:migrate && pnpm db:generate`).
--
-- Defect type master list for Phase 4 · Defect type master with AQL severity.
-- Each defect type carries a severity level (CRITICAL/MAJOR/MINOR) for QC
-- classification. Follows the master-table pattern of MisDepartment.

CREATE TYPE mis_defect_severity AS ENUM ('CRITICAL', 'MAJOR', 'MINOR');

CREATE TABLE mis_defect_types (
  id          uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  name_hi     text,
  severity    mis_defect_severity NOT NULL,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  deleted_at  timestamp with time zone,
  created_at  timestamp with time zone NOT NULL DEFAULT now(),
  updated_at  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX mis_defect_types_code_idx ON mis_defect_types (code);
CREATE INDEX mis_defect_types_deleted_at_idx ON mis_defect_types (deleted_at);

-- Prisma side (schema.prisma), added in the same commit:
--
--   enum MisDefectSeverity {
--     CRITICAL
--     MAJOR
--     MINOR
--     @@map("mis_defect_severity")
--   }
--
--   model MisDefectType {
--     id        String              @id @default(uuid()) @db.Uuid
--     code      String              @unique @map("code")
--     name      String
--     nameHi    String?             @map("name_hi")
--     severity  MisDefectSeverity   @map("severity")
--     isActive  Boolean             @default(true) @map("is_active")
--     sortOrder Int                 @default(0) @map("sort_order")
--     deletedAt DateTime?           @map("deleted_at")
--     createdAt DateTime            @default(now()) @map("created_at")
--     updatedAt DateTime            @updatedAt @map("updated_at")
--     @@map("mis_defect_types")
--   }
--
-- Then `pnpm db:generate`. NOTE: `prisma generate` cannot run from the Cowork
-- shell (engine download is 403-blocked), so this must be done on a machine
-- with network access to binaries.prisma.sh before any code references
-- `MisDefectSeverity` — tsc will not compile against a client that lacks it.
--
-- Rollback:
--   DROP TABLE mis_defect_types;
--   DROP TYPE mis_defect_severity;
