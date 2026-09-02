-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MARKERS_EXPORTED';

-- CreateTable
CREATE TABLE "canary_markers" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canary_markers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "canary_markers_mapId_userId_idx" ON "canary_markers"("mapId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "canary_markers_mapId_userId_slot_key" ON "canary_markers"("mapId", "userId", "slot");

-- AddForeignKey
ALTER TABLE "canary_markers" ADD CONSTRAINT "canary_markers_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canary_markers" ADD CONSTRAINT "canary_markers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
