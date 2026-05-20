-- CreateTable
CREATE TABLE "audit_stars" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "audit_event_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_stars_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_stars_user_id_audit_event_id_key" ON "audit_stars"("user_id", "audit_event_id");

-- CreateIndex
CREATE INDEX "audit_stars_user_id_idx" ON "audit_stars"("user_id");

-- CreateIndex
CREATE INDEX "audit_stars_audit_event_id_idx" ON "audit_stars"("audit_event_id");

-- AddForeignKey
ALTER TABLE "audit_stars" ADD CONSTRAINT "audit_stars_audit_event_id_fkey" FOREIGN KEY ("audit_event_id") REFERENCES "audit_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
