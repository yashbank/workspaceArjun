-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN "access_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_access_code_key" ON "user_profiles"("access_code");
