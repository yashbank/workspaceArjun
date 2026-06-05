-- CreateEnum
CREATE TYPE "AccessMode" AS ENUM ('unrestricted', 'ip', 'device', 'ip_and_device', 'ip_or_device');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('pending', 'approved', 'revoked');

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "access_mode" "AccessMode" NOT NULL DEFAULT 'unrestricted';

-- CreateTable
CREATE TABLE "allowed_ip_ranges" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowed_ip_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approved_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "token_hash" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'pending',
    "user_agent" TEXT,
    "browser" TEXT,
    "device_label" TEXT,
    "last_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "approved_by_id" UUID,
    "last_seen_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "approved_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "allowed_ip_ranges_user_id_idx" ON "allowed_ip_ranges"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "approved_devices_token_hash_key" ON "approved_devices"("token_hash");

-- CreateIndex
CREATE INDEX "approved_devices_user_id_idx" ON "approved_devices"("user_id");

-- CreateIndex
CREATE INDEX "approved_devices_status_idx" ON "approved_devices"("status");

-- AddForeignKey
ALTER TABLE "allowed_ip_ranges" ADD CONSTRAINT "allowed_ip_ranges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allowed_ip_ranges" ADD CONSTRAINT "allowed_ip_ranges_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_devices" ADD CONSTRAINT "approved_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_devices" ADD CONSTRAINT "approved_devices_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "user_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

