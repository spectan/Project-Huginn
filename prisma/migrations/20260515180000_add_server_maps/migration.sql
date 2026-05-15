WITH server_catalog("id", "name", "imagePath", "widthPx", "heightPx") AS (
  VALUES
    ('map-celebration', 'Celebration', '/maps/celebration-terrain.png', 2048, 2048),
    ('map-chaos', 'Chaos', '/maps/chaos-terrain.png', 4096, 4096),
    ('map-deliverance', 'Deliverance', '/maps/deliverance-terrain.png', 2048, 2048),
    ('map-exodus', 'Exodus', '/maps/exodus-terrain.png', 2048, 2048),
    ('map-independence', 'Independence', '/maps/independence-terrain.png', 4096, 4096),
    ('map-pristine', 'Pristine', '/maps/pristine-terrain.png', 2048, 2048),
    ('map-release', 'Release', '/maps/release-terrain.png', 2048, 2048),
    ('map-xanadu', 'Xanadu', '/maps/xanadu-terrain.png', 8192, 8192),
    ('map-guidance', 'Guidance', '/maps/guidance-terrain.png', 1024, 1024),
    ('map-cadence', 'Cadence', '/maps/cadence-terrain.png', 4096, 4096),
    ('map-defiance', 'Defiance', '/maps/defiance-terrain.png', 4096, 4096),
    ('map-harmony', 'Harmony', '/maps/harmony-terrain.png', 4096, 4096),
    ('map-melody', 'Melody', '/maps/melody-terrain.png', 2048, 2048),
    ('map-affliction', 'Affliction', '/maps/affliction-terrain.png', 2048, 2048),
    ('map-desertion', 'Desertion', '/maps/desertion-terrain.png', 2048, 2048),
    ('map-serenity', 'Serenity', '/maps/serenity-terrain.png', 2048, 2048)
)
UPDATE "maps"
SET
  "name" = server_catalog."name",
  "imagePath" = server_catalog."imagePath",
  "widthPx" = server_catalog."widthPx",
  "heightPx" = server_catalog."heightPx",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP
FROM server_catalog
WHERE "maps"."name" = server_catalog."name"
  OR (server_catalog."name" = 'Celebration' AND "maps"."name" = 'Wurm Online Map');

WITH server_catalog("id", "name", "imagePath", "widthPx", "heightPx") AS (
  VALUES
    ('map-celebration', 'Celebration', '/maps/celebration-terrain.png', 2048, 2048),
    ('map-chaos', 'Chaos', '/maps/chaos-terrain.png', 4096, 4096),
    ('map-deliverance', 'Deliverance', '/maps/deliverance-terrain.png', 2048, 2048),
    ('map-exodus', 'Exodus', '/maps/exodus-terrain.png', 2048, 2048),
    ('map-independence', 'Independence', '/maps/independence-terrain.png', 4096, 4096),
    ('map-pristine', 'Pristine', '/maps/pristine-terrain.png', 2048, 2048),
    ('map-release', 'Release', '/maps/release-terrain.png', 2048, 2048),
    ('map-xanadu', 'Xanadu', '/maps/xanadu-terrain.png', 8192, 8192),
    ('map-guidance', 'Guidance', '/maps/guidance-terrain.png', 1024, 1024),
    ('map-cadence', 'Cadence', '/maps/cadence-terrain.png', 4096, 4096),
    ('map-defiance', 'Defiance', '/maps/defiance-terrain.png', 4096, 4096),
    ('map-harmony', 'Harmony', '/maps/harmony-terrain.png', 4096, 4096),
    ('map-melody', 'Melody', '/maps/melody-terrain.png', 2048, 2048),
    ('map-affliction', 'Affliction', '/maps/affliction-terrain.png', 2048, 2048),
    ('map-desertion', 'Desertion', '/maps/desertion-terrain.png', 2048, 2048),
    ('map-serenity', 'Serenity', '/maps/serenity-terrain.png', 2048, 2048)
)
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
  server_catalog."id",
  server_catalog."name",
  server_catalog."imagePath",
  server_catalog."widthPx",
  server_catalog."heightPx",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM server_catalog
WHERE NOT EXISTS (
  SELECT 1
  FROM "maps"
  WHERE "maps"."name" = server_catalog."name"
);

WITH terrain_layers("serverName", "imagePath", "widthPx", "heightPx") AS (
  VALUES
    ('Celebration', '/maps/celebration-terrain.png', 2048, 2048),
    ('Chaos', '/maps/chaos-terrain.png', 4096, 4096),
    ('Deliverance', '/maps/deliverance-terrain.png', 2048, 2048),
    ('Exodus', '/maps/exodus-terrain.png', 2048, 2048),
    ('Independence', '/maps/independence-terrain.png', 4096, 4096),
    ('Pristine', '/maps/pristine-terrain.png', 2048, 2048),
    ('Release', '/maps/release-terrain.png', 2048, 2048),
    ('Xanadu', '/maps/xanadu-terrain.png', 8192, 8192),
    ('Guidance', '/maps/guidance-terrain.png', 1024, 1024),
    ('Cadence', '/maps/cadence-terrain.png', 4096, 4096),
    ('Defiance', '/maps/defiance-terrain.png', 4096, 4096),
    ('Harmony', '/maps/harmony-terrain.png', 4096, 4096),
    ('Melody', '/maps/melody-terrain.png', 2048, 2048),
    ('Affliction', '/maps/affliction-terrain.png', 2048, 2048),
    ('Desertion', '/maps/desertion-terrain.png', 2048, 2048),
    ('Serenity', '/maps/serenity-terrain.png', 2048, 2048)
)
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
  terrain_layers."imagePath",
  terrain_layers."widthPx",
  terrain_layers."heightPx",
  0,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM terrain_layers
JOIN "maps" ON "maps"."name" = terrain_layers."serverName"
ON CONFLICT ("mapId", "name") DO UPDATE SET
  "imagePath" = EXCLUDED."imagePath",
  "widthPx" = EXCLUDED."widthPx",
  "heightPx" = EXCLUDED."heightPx",
  "sortOrder" = EXCLUDED."sortOrder",
  "isDefault" = EXCLUDED."isDefault",
  "updatedAt" = CURRENT_TIMESTAMP;

WITH topo_layers("serverName", "imagePath", "widthPx", "heightPx") AS (
  VALUES
    ('Celebration', '/maps/celebration-topo.png', 2048, 2048),
    ('Chaos', '/maps/chaos-topo.png', 4096, 4096),
    ('Deliverance', '/maps/deliverance-topo.png', 2048, 2048),
    ('Exodus', '/maps/exodus-topo.png', 2048, 2048),
    ('Independence', '/maps/independence-topo.png', 4096, 4096),
    ('Pristine', '/maps/pristine-topo.png', 2048, 2048),
    ('Release', '/maps/release-topo.png', 2048, 2048),
    ('Xanadu', '/maps/xanadu-topo.png', 8192, 8192),
    ('Cadence', '/maps/cadence-topo.png', 4096, 4096),
    ('Defiance', '/maps/defiance-topo.png', 4096, 4096),
    ('Harmony', '/maps/harmony-topo.png', 4096, 4096),
    ('Melody', '/maps/melody-topo.png', 2048, 2048),
    ('Affliction', '/maps/affliction-topo.png', 2048, 2048),
    ('Desertion', '/maps/desertion-topo.png', 2048, 2048),
    ('Serenity', '/maps/serenity-topo.png', 2048, 2048)
)
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
  topo_layers."imagePath",
  topo_layers."widthPx",
  topo_layers."heightPx",
  1,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM topo_layers
JOIN "maps" ON "maps"."name" = topo_layers."serverName"
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
WHERE "maps"."name" IN (
  'Celebration',
  'Chaos',
  'Deliverance',
  'Exodus',
  'Independence',
  'Pristine',
  'Release',
  'Xanadu',
  'Guidance',
  'Cadence',
  'Defiance',
  'Harmony',
  'Melody',
  'Affliction',
  'Desertion',
  'Serenity'
)
ON CONFLICT ("mapId", "name") DO NOTHING;
