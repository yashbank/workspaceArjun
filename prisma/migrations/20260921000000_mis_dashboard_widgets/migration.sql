-- NOT APPLIED YET. Parked outside prisma/migrations/ so `prisma migrate` cannot pick
-- it up until the human promotes it (DEVELOPMENT_GUIDE.md §2.3, the SCHEMA GATE).
--
-- Phase 24 · the desktop layer. Per-user dashboard layout (D2-Widget-library.png).
--
-- The artboard is explicit about the shape: "The layout is rows of widgetKey, x, y, w, h
-- against a user id — not a blob of JSON. A widget retired in a later release is dropped
-- by key on read, so an old layout never breaks a dashboard."
--
-- Naming and @@map style follow mis_user_preferences (the other per-user MIS table).
--
-- To promote (human, VS Code terminal, from Arjun/app):
--   mv prisma/migrations-pending/20260921000000_mis_dashboard_widgets prisma/migrations/
--   pnpm db:deploy && pnpm db:generate

CREATE TABLE "mis_dashboard_widgets" (
    "user_profile_id" UUID NOT NULL,
    "widget_key"      TEXT NOT NULL,
    "x"               INTEGER NOT NULL,
    "y"               INTEGER NOT NULL,
    "w"               INTEGER NOT NULL,
    "h"               INTEGER NOT NULL,
    "updated_at"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mis_dashboard_widgets_pkey" PRIMARY KEY ("user_profile_id", "widget_key")
);

-- The grid is the constraint, and it belongs in the database rather than only in the
-- screen that drew it: four columns wide, so a widget must start inside the grid and
-- must not hang off the right edge. Heights are bounded to keep one widget from
-- burying every other (D1's tallest is 3 rows).
ALTER TABLE "mis_dashboard_widgets"
  ADD CONSTRAINT "mis_dashboard_widgets_grid_ck"
  CHECK (
    "x" >= 0 AND "w" >= 1 AND "x" + "w" <= 4 AND
    "y" >= 0 AND "h" >= 1 AND "h" <= 3
  );

-- Every read is "this one person's layout", so the primary key's leading column already
-- serves it; the explicit index is here because the cascade delete below scans by owner.
CREATE INDEX "mis_dashboard_widgets_user_profile_id_idx"
  ON "mis_dashboard_widgets" ("user_profile_id");

-- A removed person takes their layout with them. It is per-user furniture and means
-- nothing without them.
ALTER TABLE "mis_dashboard_widgets"
  ADD CONSTRAINT "mis_dashboard_widgets_user_profile_id_fkey"
  FOREIGN KEY ("user_profile_id") REFERENCES "user_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Rollback:
--   ALTER TABLE "mis_dashboard_widgets" DROP CONSTRAINT "mis_dashboard_widgets_user_profile_id_fkey";
--   DROP INDEX "mis_dashboard_widgets_user_profile_id_idx";
--   ALTER TABLE "mis_dashboard_widgets" DROP CONSTRAINT "mis_dashboard_widgets_grid_ck";
--   DROP TABLE "mis_dashboard_widgets";
