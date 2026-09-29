import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getFavoriteServerIdFromSettingsRows } from "./map-settings";
import type {
  SaveUserMapSettingsDependencies,
  SettingsProfilesDependencies,
  UserMapSettingsDependencies
} from "./map-settings-service";

type SettingsClient = Pick<Prisma.TransactionClient, "userMapSettings">;

const PROFILE_SELECT = {
  name: true,
  settings: true,
  slot: true,
  updatedAt: true
} as const;

function createSettingsStore(
  client: SettingsClient
): Pick<UserMapSettingsDependencies, "findSettings" | "upsertSettings"> {
  return {
    findSettings: async (userId, mapId) => client.userMapSettings.findUnique({
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
    upsertSettings: async ({ mapId, settings, userId }) => client.userMapSettings.upsert({
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

export function createUserMapSettingsDependencies(): SaveUserMapSettingsDependencies {
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
    ...createSettingsStore(prisma),
    // An advisory lock (rather than SELECT ... FOR UPDATE) also serializes the
    // first save, when no row exists yet to lock.
    withSettingsLock: async ({ mapId, userId }, work) => prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`user-map-settings:${userId}:${mapId}`}))`;
      return work(createSettingsStore(tx));
    })
  };
}

export function createSettingsProfilesDependencies(): SettingsProfilesDependencies {
  return {
    ...createUserMapSettingsDependencies(),
    findProfile: async (userId, slot) => prisma.mapSettingsProfile.findUnique({
      select: PROFILE_SELECT,
      where: {
        userId_slot: {
          slot,
          userId
        }
      }
    }),
    listProfiles: async (userId) => prisma.mapSettingsProfile.findMany({
      orderBy: {
        slot: "asc"
      },
      select: PROFILE_SELECT,
      where: {
        userId
      }
    }),
    renameProfile: async ({ name, slot, userId }) => {
      const existing = await prisma.mapSettingsProfile.findUnique({
        select: {
          id: true
        },
        where: {
          userId_slot: {
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
    upsertProfile: async ({ name, settings, slot, userId }) => prisma.mapSettingsProfile.upsert({
      create: {
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
        userId_slot: {
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
