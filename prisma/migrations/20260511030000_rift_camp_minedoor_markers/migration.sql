ALTER TYPE "AuditTargetType" ADD VALUE 'RIFT';
ALTER TYPE "AuditTargetType" ADD VALUE 'CAMP';
ALTER TYPE "AuditTargetType" ADD VALUE 'MINEDOOR';

CREATE TABLE "rifts" (
  "id" TEXT NOT NULL,
  "mapId" TEXT NOT NULL,
  "x" INTEGER NOT NULL,
  "y" INTEGER NOT NULL,
  "arrivalDate" DATE,
  "estimatedRiftTime" TIMESTAMP(3),
  "notes" TEXT NOT NULL DEFAULT '',
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,
  "deleteExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "rifts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "camps" (
  "id" TEXT NOT NULL,
  "mapId" TEXT NOT NULL,
  "x" INTEGER NOT NULL,
  "y" INTEGER NOT NULL,
  "campType" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,
  "deleteExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "camps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "minedoors" (
  "id" TEXT NOT NULL,
  "mapId" TEXT NOT NULL,
  "x" INTEGER NOT NULL,
  "y" INTEGER NOT NULL,
  "strength" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,
  "deleteExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "minedoors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "rifts_mapId_deletedAt_idx" ON "rifts"("mapId", "deletedAt");
CREATE INDEX "rifts_deleteExpiresAt_idx" ON "rifts"("deleteExpiresAt");
CREATE INDEX "camps_mapId_deletedAt_idx" ON "camps"("mapId", "deletedAt");
CREATE INDEX "camps_deleteExpiresAt_idx" ON "camps"("deleteExpiresAt");
CREATE INDEX "minedoors_mapId_deletedAt_idx" ON "minedoors"("mapId", "deletedAt");
CREATE INDEX "minedoors_deleteExpiresAt_idx" ON "minedoors"("deleteExpiresAt");

ALTER TABLE "rifts" ADD CONSTRAINT "rifts_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rifts" ADD CONSTRAINT "rifts_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rifts" ADD CONSTRAINT "rifts_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rifts" ADD CONSTRAINT "rifts_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "camps" ADD CONSTRAINT "camps_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "camps" ADD CONSTRAINT "camps_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "camps" ADD CONSTRAINT "camps_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "camps" ADD CONSTRAINT "camps_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "minedoors" ADD CONSTRAINT "minedoors_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "minedoors" ADD CONSTRAINT "minedoors_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "minedoors" ADD CONSTRAINT "minedoors_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "minedoors" ADD CONSTRAINT "minedoors_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
