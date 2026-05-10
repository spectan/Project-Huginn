-- CreateTable
CREATE TABLE "note_categories" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_categories_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "notes" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'General',
ADD COLUMN "title" TEXT NOT NULL DEFAULT 'Untitled';

-- Seed one default category per existing map.
INSERT INTO "note_categories" ("id", "mapId", "name", "createdAt", "updatedAt")
SELECT 'default-category-' || "id", "id", 'General', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "maps";

-- CreateIndex
CREATE UNIQUE INDEX "note_categories_mapId_name_key" ON "note_categories"("mapId", "name");

-- CreateIndex
CREATE INDEX "note_categories_mapId_idx" ON "note_categories"("mapId");

-- AddForeignKey
ALTER TABLE "note_categories" ADD CONSTRAINT "note_categories_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
