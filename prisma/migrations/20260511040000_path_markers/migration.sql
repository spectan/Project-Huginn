ALTER TYPE "AuditTargetType" ADD VALUE 'PATH';

CREATE TABLE "path_markers" (
  "id" TEXT NOT NULL,
  "mapId" TEXT NOT NULL,
  "pathType" TEXT NOT NULL,
  "x" INTEGER NOT NULL,
  "y" INTEGER NOT NULL,
  "name" TEXT NOT NULL DEFAULT '',
  "width" INTEGER NOT NULL DEFAULT 1,
  "notes" TEXT NOT NULL DEFAULT '',
  "points" JSONB NOT NULL,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,
  "deleteExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "path_markers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "path_markers_mapId_deletedAt_idx" ON "path_markers"("mapId", "deletedAt");
CREATE INDEX "path_markers_deleteExpiresAt_idx" ON "path_markers"("deleteExpiresAt");
CREATE INDEX "path_markers_pathType_idx" ON "path_markers"("pathType");

ALTER TABLE "path_markers" ADD CONSTRAINT "path_markers_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "path_markers" ADD CONSTRAINT "path_markers_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "path_markers" ADD CONSTRAINT "path_markers_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "path_markers" ADD CONSTRAINT "path_markers_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
