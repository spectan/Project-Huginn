-- Fix Celebration map ID from generated CUID to consistent map-{name} format
-- This aligns it with all other servers and ensures shareable links use readable slugs.

BEGIN;

UPDATE "map_layers"
SET id = 'terrain-map-celebration'
WHERE id = 'terrain-cmozho9ej0001k30jsmjgq53c';

UPDATE "map_layers"
SET id = 'topographical-map-celebration'
WHERE id = 'topographical-cmozho9ej0001k30jsmjgq53c';

UPDATE "maps"
SET id = 'map-celebration'
WHERE id = 'cmozho9ej0001k30jsmjgq53c';

COMMIT;
