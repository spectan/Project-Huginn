UPDATE "maps"
SET
  "isActive" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Guidance';

INSERT INTO "maps" (
  "id",
  "name",
  "imagePath",
  "widthPx",
  "heightPx",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  'map-elevation',
  'Elevation',
  '/maps/elevation-terrain.png',
  2048,
  2048,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "maps"
  WHERE "name" = 'Elevation'
);

UPDATE "maps"
SET
  "imagePath" = '/maps/elevation-terrain.png',
  "widthPx" = 2048,
  "heightPx" = 2048,
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Elevation';

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
  'terrain-' || "maps"."id",
  "maps"."id",
  'Terrain',
  '/maps/elevation-terrain.png',
  2048,
  2048,
  0,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "maps"
WHERE "maps"."name" = 'Elevation'
ON CONFLICT ("mapId", "name") DO UPDATE SET
  "imagePath" = EXCLUDED."imagePath",
  "widthPx" = EXCLUDED."widthPx",
  "heightPx" = EXCLUDED."heightPx",
  "sortOrder" = EXCLUDED."sortOrder",
  "isDefault" = EXCLUDED."isDefault",
  "updatedAt" = CURRENT_TIMESTAMP;

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
  'topographical-' || "maps"."id",
  "maps"."id",
  'Topographical',
  '/maps/elevation-topo.png',
  2048,
  2048,
  1,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "maps"
WHERE "maps"."name" = 'Elevation'
ON CONFLICT ("mapId", "name") DO UPDATE SET
  "imagePath" = EXCLUDED."imagePath",
  "widthPx" = EXCLUDED."widthPx",
  "heightPx" = EXCLUDED."heightPx",
  "sortOrder" = EXCLUDED."sortOrder",
  "isDefault" = EXCLUDED."isDefault",
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "note_categories" (
  "id",
  "mapId",
  "name",
  "createdAt",
  "updatedAt"
)
SELECT
  'general-' || "maps"."id",
  "maps"."id",
  'General',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "maps"
WHERE "maps"."name" = 'Elevation'
ON CONFLICT ("mapId", "name") DO NOTHING;
