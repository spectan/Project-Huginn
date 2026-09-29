-- Remove duplicate feed events, keeping one row per (mapId, timestamp, message).
DELETE FROM "events" AS e
USING "events" AS keep
WHERE e."mapId" = keep."mapId"
  AND e."timestamp" = keep."timestamp"
  AND e."message" = keep."message"
  AND e."id" > keep."id";

-- CreateIndex
CREATE UNIQUE INDEX "events_mapId_timestamp_message_key" ON "events"("mapId", "timestamp", "message");
