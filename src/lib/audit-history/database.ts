import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuditHistoryActionGroup, AuditHistoryDependencies } from "./audit-history";

const ACTION_GROUP_ACTIONS: Record<AuditHistoryActionGroup, Prisma.AuditEventWhereInput["action"]> = {
  add: { in: ["MARKER_CREATED"] },
  delete: { in: ["MARKER_DELETED", "MARKER_CLEANED_UP"] },
  edit: { in: ["MARKER_UPDATED"] },
  other: {
    notIn: ["MARKER_CREATED", "MARKER_UPDATED", "MARKER_DELETED", "MARKER_CLEANED_UP"]
  }
};

export function createAuditHistoryDependencies(clientIp?: string): AuditHistoryDependencies {
  return {
    listEvents: async ({ actionGroup, actorUserId, before, limit, mapId, order = "desc" }) => {
      const where: Prisma.AuditEventWhereInput = {};

      if (actionGroup !== undefined) {
        where.action = ACTION_GROUP_ACTIONS[actionGroup];
      }

      if (actorUserId !== undefined) {
        where.actorUserId = actorUserId;
      }

      if (mapId !== undefined) {
        where.mapId = mapId;
      }

      if (before !== null) {
        where.OR = order === "asc"
          ? [
              {
                createdAt: {
                  gt: before.createdAt
                }
              },
              {
                createdAt: before.createdAt,
                id: {
                  gt: before.id
                }
              }
            ]
          : [
              {
                createdAt: {
                  lt: before.createdAt
                }
              },
              {
                createdAt: before.createdAt,
                id: {
                  lt: before.id
                }
              }
            ];
      }

      return prisma.auditEvent.findMany({
        include: {
          actor: {
            select: {
              username: true
            }
          },
          map: {
            select: {
              name: true
            }
          }
        },
        orderBy: [
          {
            createdAt: order
          },
          {
            id: order
          }
        ],
        take: limit,
        where
      });
    },
    listMaps: async () => prisma.map.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true
      },
      where: { isActive: true }
    }),
    listUsers: async () => prisma.user.findMany({
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true
      }
    }),
    recordAudit: async (input) => {
      const metadata = clientIp !== undefined && clientIp.length > 0
        ? { ...input.metadata, clientIp }
        : input.metadata;
      await prisma.auditEvent.create({
        data: {
          action: input.action,
          actorUserId: input.actorUserId,
          mapId: input.mapId,
          metadata: metadata as Prisma.InputJsonValue,
          targetId: input.targetId,
          targetType: input.targetType
        }
      });
    }
  };
}
