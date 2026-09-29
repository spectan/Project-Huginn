-- Profiles become per-user instead of per-map. Where a user saved the same
-- slot on several maps, keep the most recently updated one.
DELETE FROM "map_settings_profiles" AS p
USING "map_settings_profiles" AS newer
WHERE p."userId" = newer."userId"
  AND p."slot" = newer."slot"
  AND (newer."updatedAt" > p."updatedAt"
    OR (newer."updatedAt" = p."updatedAt" AND newer."id" > p."id"));

-- DropForeignKey
ALTER TABLE "map_settings_profiles" DROP CONSTRAINT "map_settings_profiles_mapId_fkey";

-- DropIndex
DROP INDEX "map_settings_profiles_userId_mapId_idx";

-- DropIndex
DROP INDEX "map_settings_profiles_userId_mapId_slot_key";

-- AlterTable
ALTER TABLE "map_settings_profiles" DROP COLUMN "mapId";

-- CreateIndex
CREATE UNIQUE INDEX "map_settings_profiles_userId_slot_key" ON "map_settings_profiles"("userId", "slot");
