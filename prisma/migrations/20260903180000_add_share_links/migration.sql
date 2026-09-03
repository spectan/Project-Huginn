-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "layerId" TEXT,
    "settings" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_links_tokenHash_key" ON "share_links"("tokenHash");

-- CreateIndex
CREATE INDEX "share_links_mapId_idx" ON "share_links"("mapId");

-- CreateIndex
CREATE INDEX "share_links_createdByUserId_idx" ON "share_links"("createdByUserId");

-- CreateIndex
CREATE INDEX "share_links_expiresAt_idx" ON "share_links"("expiresAt");

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

