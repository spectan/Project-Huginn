import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getFavoriteServerIdFromSettingsRows } from "./map-settings";
import type {
  SettingsProfilesDependencies,
  UserMapSettingsDependencies
} from "./map-settings-service";

const PROFILE_SELECT = {
  name: true,
  settings: true,
  slot: true,
  updatedAt: true
} as const;

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

export function createSettingsProfilesDependencies(): SettingsProfilesDependencies {
  return {
    ...createUserMapSettingsDependencies(),
    findProfile: async (userId, mapId, slot) => prisma.mapSettingsProfile.findUnique({
      select: PROFILE_SELECT,
      where: {
        userId_mapId_slot: {
          mapId,
          slot,
          userId
        }
      }
    }),
    listProfiles: async (userId, mapId) => prisma.mapSettingsProfile.findMany({
      orderBy: {
        slot: "asc"
      },
      select: PROFILE_SELECT,
      where: {
        mapId,
        userId
      }
    }),
    renameProfile: async ({ mapId, name, slot, userId }) => {
      const existing = await prisma.mapSettingsProfile.findUnique({
        select: {
          id: true
        },
        where: {
          userId_mapId_slot: {
            mapId,
            slot,
            userId
          }
        }
      });

      if (existing === null) {
        return null;
      }

      return prisma.mapSettingsProfile.update({
        data: {
          name
        },
        select: PROFILE_SELECT,
        where: {
          id: existing.id
        }
      });
    },
    upsertProfile: async ({ mapId, name, settings, slot, userId }) => prisma.mapSettingsProfile.upsert({
      create: {
        mapId,
        name,
        settings: settings as unknown as Prisma.InputJsonValue,
        slot,
        userId
      },
      select: PROFILE_SELECT,
      update: {
        name,
        settings: settings as unknown as Prisma.InputJsonValue
      },
      where: {
        userId_mapId_slot: {
          mapId,
          slot,
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
