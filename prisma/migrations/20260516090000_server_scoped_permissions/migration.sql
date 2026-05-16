-- CreateTable
CREATE TABLE "user_map_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'NONE',
    "isOperator" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_map_permissions_pkey" PRIMARY KEY ("id")
);

-- Backfill existing global read/write users onto all active maps.
INSERT INTO "user_map_permissions" ("id", "userId", "mapId", "accessLevel", "isOperator", "createdAt", "updatedAt")
SELECT
    CONCAT("users"."id", ':', "maps"."id"),
    "users"."id",
    "maps"."id",
    "users"."accessLevel",
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "users"
CROSS JOIN "maps"
WHERE "users"."approvalStatus" = 'APPROVED'
  AND "users"."accessLevel" IN ('READ', 'WRITE')
  AND "maps"."isActive" = true;

-- CreateIndex
CREATE UNIQUE INDEX "user_map_permissions_userId_mapId_key" ON "user_map_permissions"("userId", "mapId");

-- CreateIndex
CREATE INDEX "user_map_permissions_mapId_idx" ON "user_map_permissions"("mapId");

-- CreateIndex
CREATE INDEX "user_map_permissions_isOperator_idx" ON "user_map_permissions"("isOperator");

-- AddForeignKey
ALTER TABLE "user_map_permissions" ADD CONSTRAINT "user_map_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_map_permissions" ADD CONSTRAINT "user_map_permissions_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
