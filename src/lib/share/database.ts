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
    createShareLinkAlert: async (input) => {
      await prisma.alert.create({
        data: {
          actorUserId: input.actorUserId,
          description: input.description,
          mapId: input.mapId,
          metadata: input.metadata as Prisma.InputJsonValue,
          rule: input.rule,
          severity: input.severity,
          status: "OPEN",
          title: input.title
        }
      });
    },
    deleteShareLink: async (tokenHash) => {
      await prisma.shareLink.deleteMany({
        where: {
          tokenHash
        }
      });
    },
    findMapName: async (mapId) => {
      const map = await prisma.map.findUnique({
        select: {
          name: true
        },
        where: {
          id: mapId
        }
      });

      return map?.name ?? null;
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
    recordAudit: async (input) => {
      await prisma.auditEvent.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId,
          mapId: input.mapId,
          metadata: input.metadata as Prisma.InputJsonValue,
          targetId: input.targetId,
          targetType: input.targetType
        }
      });
    },
    settings: createUserMapSettingsDependencies()
  };
}
