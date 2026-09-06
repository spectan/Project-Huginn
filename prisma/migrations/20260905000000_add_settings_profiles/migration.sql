-- CreateTable
CREATE TABLE "map_settings_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_settings_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "map_settings_profiles_userId_mapId_idx" ON "map_settings_profiles"("userId", "mapId");

-- CreateIndex
CREATE UNIQUE INDEX "map_settings_profiles_userId_mapId_slot_key" ON "map_settings_profiles"("userId", "mapId", "slot");

-- AddForeignKey
ALTER TABLE "map_settings_profiles" ADD CONSTRAINT "map_settings_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_settings_profiles" ADD CONSTRAINT "map_settings_profiles_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

