-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_mapId_timestamp_idx" ON "events"("mapId", "timestamp");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
