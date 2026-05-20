-- CreateEnum
CREATE TYPE "UserInviteStatus" AS ENUM ('pending', 'accepted', 'cancelled');

-- CreateTable
CREATE TABLE "user_invites" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserInviteStatus" NOT NULL DEFAULT 'pending',
    "invited_by" UUID NOT NULL,
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMP(3),

    CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_invites_email_key" ON "user_invites"("email");

-- CreateIndex
CREATE INDEX "user_invites_status_idx" ON "user_invites"("status");

-- AddForeignKey
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "user_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
