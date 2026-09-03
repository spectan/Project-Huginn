import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createUserMapSettingsDependencies } from "@/lib/map-settings/database";
import type { ShareDependencies } from "./share-service";

export function createShareDependencies(): ShareDependencies {
  return {
    createShareLink: async ({ createdByUserId, expiresAt, layerId, mapId, settings, tokenHash }) => {
      await prisma.shareLink.create({
        data: {
          createdByUserId,
          expiresAt,
          layerId,
          mapId,
          settings: settings as unknown as Prisma.InputJsonValue,
          tokenHash
        }
      });
    },
    findShareLinkWithCreator: async (tokenHash) => prisma.shareLink.findUnique({
      select: {
        createdBy: {
          select: {
            id: true,
            watermarkNumber: true
          }
        },
        expiresAt: true,
        layerId: true,
        mapId: true,
        settings: true
      },
      where: {
        tokenHash
      }
    }),
    settings: createUserMapSettingsDependencies()
  };
}
