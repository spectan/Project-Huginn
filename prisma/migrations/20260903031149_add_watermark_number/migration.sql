-- AlterTable
ALTER TABLE "users" ADD COLUMN "watermarkNumber" INTEGER;

-- Backfill existing users with sequential numbers based on creation time.
UPDATE "users"
SET "watermarkNumber" = sub.num
FROM (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt") AS num
  FROM "users"
) sub
WHERE "users".id = sub.id;

-- CreateUniqueIndex
CREATE UNIQUE INDEX "users_watermarkNumber_key" ON "users"("watermarkNumber");
