-- AlterTable
ALTER TABLE "discord_config" ADD COLUMN     "notifyMarkerCreated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyMarkerDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyMarkerUpdated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifyShareLinks" BOOLEAN NOT NULL DEFAULT false;

