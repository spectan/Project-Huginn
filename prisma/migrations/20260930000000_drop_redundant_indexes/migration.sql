-- Covered by the (mapId, ...) unique indexes on the same tables.
DROP INDEX "note_categories_mapId_idx";
DROP INDEX "events_mapId_timestamp_idx";
DROP INDEX "canary_markers_mapId_userId_idx";

-- Never used by any query filter or sort.
DROP INDEX "users_accessLevel_idx";
DROP INDEX "user_map_permissions_isOperator_idx";
