-- CreateTable
CREATE TABLE "user_map_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_map_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_map_settings_userId_mapId_key" ON "user_map_settings"("userId", "mapId");

-- CreateIndex
CREATE INDEX "user_map_settings_mapId_idx" ON "user_map_settings"("mapId");

-- AddForeignKey
ALTER TABLE "user_map_settings" ADD CONSTRAINT "user_map_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_map_settings" ADD CONSTRAINT "user_map_settings_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
