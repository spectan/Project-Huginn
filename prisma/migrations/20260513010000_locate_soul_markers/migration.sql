ALTER TYPE "AuditTargetType" ADD VALUE 'LOCATE_SOUL';

CREATE TABLE "locate_souls" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "targetName" TEXT NOT NULL,
    "casterFacing" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "distanceBand" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "deleteExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locate_souls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "locate_souls_mapId_deletedAt_idx" ON "locate_souls"("mapId", "deletedAt");
CREATE INDEX "locate_souls_deleteExpiresAt_idx" ON "locate_souls"("deleteExpiresAt");

ALTER TABLE "locate_souls" ADD CONSTRAINT "locate_souls_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "locate_souls" ADD CONSTRAINT "locate_souls_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "locate_souls" ADD CONSTRAINT "locate_souls_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "locate_souls" ADD CONSTRAINT "locate_souls_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
