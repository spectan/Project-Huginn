CREATE TABLE "map_layers" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "widthPx" INTEGER NOT NULL,
    "heightPx" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_layers_pkey" PRIMARY KEY ("id")
);

UPDATE "maps"
SET "name" = 'Celebration'
WHERE "name" = 'Wurm Online Map';

CREATE UNIQUE INDEX "map_layers_mapId_name_key" ON "map_layers"("mapId", "name");
CREATE INDEX "map_layers_mapId_sortOrder_idx" ON "map_layers"("mapId", "sortOrder");

INSERT INTO "map_layers" (
    "id",
    "mapId",
    "name",
    "imagePath",
    "widthPx",
    "heightPx",
    "sortOrder",
    "isDefault",
    "createdAt",
    "updatedAt"
)
SELECT
    'terrain-' || "id",
    "id",
    'Terrain',
    "imagePath",
    "widthPx",
    "heightPx",
    0,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "maps"
ON CONFLICT ("mapId", "name") DO NOTHING;

INSERT INTO "map_layers" (
    "id",
    "mapId",
    "name",
    "imagePath",
    "widthPx",
    "heightPx",
    "sortOrder",
    "isDefault",
    "createdAt",
    "updatedAt"
)
SELECT
    'topographical-' || "id",
    "id",
    'Topographical',
    '/maps/celebration-topo.png',
    "widthPx",
    "heightPx",
    1,
    false,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "maps"
WHERE "name" = 'Celebration'
ON CONFLICT ("mapId", "name") DO NOTHING;

ALTER TABLE "map_layers" ADD CONSTRAINT "map_layers_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
