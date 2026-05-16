import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getFavoriteServerIdFromSettingsRows } from "./map-settings";
import type { UserMapSettingsDependencies } from "./map-settings-service";

export function createUserMapSettingsDependencies(): UserMapSettingsDependencies {
  return {
    findMap: async (mapId) => prisma.map.findFirst({
      select: {
        id: true
      },
      where: {
        id: mapId,
        isActive: true
      }
    }),
    findSettings: async (userId, mapId) => prisma.userMapSettings.findUnique({
      select: {
        settings: true
      },
      where: {
        userId_mapId: {
          mapId,
          userId
        }
      }
    }),
    upsertSettings: async ({ mapId, settings, userId }) => prisma.userMapSettings.upsert({
      create: {
        mapId,
        settings: settings as unknown as Prisma.InputJsonValue,
        userId
      },
      select: {
        settings: true
      },
      update: {
        settings: settings as unknown as Prisma.InputJsonValue
      },
      where: {
        userId_mapId: {
          mapId,
          userId
        }
      }
    })
  };
}

export async function findUserFavoriteServerId(userId: string): Promise<string | null> {
  const settingsRows = await prisma.userMapSettings.findMany({
    orderBy: { updatedAt: "desc" },
    select: { settings: true },
    where: { userId }
  });

  return getFavoriteServerIdFromSettingsRows(settingsRows);
}
